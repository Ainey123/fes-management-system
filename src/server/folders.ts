import { db } from './db';
import { folders, departments } from './drizzle/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logAction } from './audit';

/** Ensure root folder and department root folders exist */
export async function ensureRootFolder() {
  let rootId: number;
  const existing = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.name, 'FAST ENGINEERING'), isNull(folders.parentId)))
    .limit(1)
    .execute();

  if (existing.length === 0) {
    const inserted = await db
      .insert(folders)
      .values({ name: 'FAST ENGINEERING' })
      .returning({ id: folders.id })
      .execute();
    rootId = inserted[0].id;
  } else {
    rootId = existing[0].id;
  }

  // Ensure department root folders exist under FAST ENGINEERING
  const deptList = await db.select().from(departments).execute();
  for (const dept of deptList) {
    const existingDeptFolder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.departmentId, dept.id), eq(folders.parentId, rootId)))
      .limit(1)
      .execute();

    if (existingDeptFolder.length === 0) {
      await db.insert(folders).values({
        name: dept.name,
        parentId: rootId,
        departmentId: dept.id,
      }).execute();
    }
  }

  return rootId;
}

/** Create a new folder */
export async function createFolder(
  name: string,
  parentId?: number,
  userId?: string,
  departmentId?: number
) {
  let resolvedDeptId = departmentId;
  if (!resolvedDeptId && parentId) {
    const parent = await db
      .select({ departmentId: folders.departmentId })
      .from(folders)
      .where(eq(folders.id, parentId))
      .limit(1)
      .execute();
    if (parent.length > 0 && parent[0].departmentId) {
      resolvedDeptId = parent[0].departmentId;
    }
  }

  const inserted = await db
    .insert(folders)
    .values({ name, parentId: parentId ?? null, departmentId: resolvedDeptId ?? null })
    .returning({ id: folders.id, name: folders.name, parentId: folders.parentId, departmentId: folders.departmentId })
    .execute();

  const folderId = inserted[0].id;
  await logAction(userId ?? '', 'CREATE_FOLDER', 'folder', String(folderId), {
    folderName: name,
    departmentId: resolvedDeptId,
    parentId,
  });
  return folderId;
}

/** Rename folder */
export async function renameFolder(id: number, newName: string, userId?: string) {
  await db
    .update(folders)
    .set({ name: newName })
    .where(eq(folders.id, id))
    .execute();
  await logAction(userId ?? '', 'RENAME_FOLDER', 'folder', String(id), { newName });
}

/** Move folder */
export async function moveFolder(id: number, newParentId: number | null, userId?: string) {
  await db
    .update(folders)
    .set({ parentId: newParentId })
    .where(eq(folders.id, id))
    .execute();
  await logAction(userId ?? '', 'MOVE_FOLDER', 'folder', String(id), { newParentId });
}

/** Soft delete folder */
export async function softDeleteFolder(id: number, userId?: string) {
  await db
    .update(folders)
    .set({ deletedAt: new Date(), deletedBy: userId ?? null })
    .where(eq(folders.id, id))
    .execute();
  await logAction(userId ?? '', 'DELETE_FOLDER', 'folder', String(id));
}

/** Restore folder */
export async function restoreFolder(id: number, userId?: string) {
  await db
    .update(folders)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(folders.id, id))
    .execute();
  await logAction(userId ?? '', 'RESTORE_FOLDER', 'folder', String(id));
}

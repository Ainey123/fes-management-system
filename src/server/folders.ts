import { db } from './db';
import { folders } from './drizzle/schema';
import { eq } from 'drizzle-orm';
import { logAction } from './audit';

/** Ensure root folder exists */
export async function ensureRootFolder() {
  const existing = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.name, 'FAST ENGINEERING'))
    .limit(1)
    .execute();
  if (existing.length === 0) {
    await db.insert(folders).values({ name: 'FAST ENGINEERING' }).execute();
  }
}

/** Create a new folder */
export async function createFolder(name: string, parentId?: number, userId?: string) {
  // permission check for CREATE_FOLDER
  if (parentId) {
    // fetch parent to get departmentId (assuming folder belongs to a department via top-level folder)
  }
  const inserted = await db
    .insert(folders)
    .values({ name, parentId })
    .returning({ id: folders.id })
    .execute();
  const folderId = inserted[0].id;
  await logAction(userId ?? '', 'CREATE_FOLDER', 'folder', String(folderId));
  return folderId;
}

/** Rename folder */
export async function renameFolder(id: number, newName: string, userId?: string) {
  await db
    .update(folders)
    .set({ name: newName })
    .where(eq(folders.id, id))
    .execute();
  await logAction(userId ?? '', 'RENAME_FOLDER', 'folder', String(id));
}

/** Move folder */
export async function moveFolder(id: number, newParentId: number | null, userId?: string) {
  await db
    .update(folders)
    .set({ parentId: newParentId })
    .where(eq(folders.id, id))
    .execute();
  await logAction(userId ?? '', 'MOVE_FOLDER', 'folder', String(id));
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

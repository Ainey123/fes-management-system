// app/api/departments/[id]/explorer/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { departments, folders, files, users, auditLogs } from '@/src/server/drizzle/schema';
import { eq, and, isNull, inArray, desc, ilike } from 'drizzle-orm';
import { requireAuthUser } from '@/src/server/authorization';
import { ensureRootFolder } from '@/src/server/folders';
import { ensureDatabaseTables } from '@/src/server/dbInit';

interface RawFileRow {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  folderId: number | null;
  uploadedBy: string | null;
  uploadedAt: Date;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();
    await ensureRootFolder();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    const { id: deptIdParam } = await props.params;
    const deptId = parseInt(deptIdParam, 10);
    if (isNaN(deptId) || deptId <= 0) {
      return NextResponse.json({ error: 'Invalid department ID' }, { status: 400 });
    }

    // Authorization: Super Admin & Admin can access all departments.
    // Employees can only access departments they are assigned to.
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';
    if (!isSuperAdmin && auth.user.departmentId !== deptId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to access this department repository.' },
        { status: 403 }
      );
    }

    // Fetch department
    const deptRows = await db
      .select()
      .from(departments)
      .where(eq(departments.id, deptId))
      .limit(1)
      .execute();

    if (deptRows.length === 0) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }
    const department = deptRows[0];

    const { searchParams } = new URL(request.url);
    const folderIdParam = searchParams.get('folderId');
    const searchQuery = searchParams.get('search')?.trim() || '';

    // Fetch all active folders for this department
    const deptFolders = await db
      .select()
      .from(folders)
      .where(and(eq(folders.departmentId, deptId), isNull(folders.deletedAt)))
      .execute();

    // Identify department root folder
    let deptRootFolder = deptFolders.find((f) => f.name === department.name);
    if (!deptRootFolder && deptFolders.length > 0) {
      deptRootFolder = deptFolders[0];
    }

    // Determine current active folder
    let currentFolder = deptRootFolder;
    if (folderIdParam) {
      const requestedId = parseInt(folderIdParam, 10);
      const matched = deptFolders.find((f) => f.id === requestedId);
      if (matched) {
        currentFolder = matched;
      }
    }

    if (!currentFolder) {
      const rootId = await ensureRootFolder();
      const newFolder = await db
        .insert(folders)
        .values({
          name: department.name,
          parentId: rootId,
          departmentId: deptId,
        })
        .returning()
        .execute();
      currentFolder = newFolder[0];
      deptFolders.push(currentFolder);
    }

    // Build Breadcrumb path from current folder up to root
    const breadcrumbs: Array<{ id: number | null; name: string }> = [];
    let curCursor: typeof currentFolder | undefined = currentFolder;
    const visited = new Set<number>();

    while (curCursor && !visited.has(curCursor.id)) {
      visited.add(curCursor.id);
      breadcrumbs.unshift({ id: curCursor.id, name: curCursor.name });
      if (curCursor.parentId) {
        curCursor = deptFolders.find((f) => f.id === curCursor?.parentId);
      } else {
        break;
      }
    }
    breadcrumbs.unshift({ id: null, name: 'FAST ENGINEERING' });

    // Fetch child folders of currentFolder
    let childFolders = deptFolders.filter((f) => f.parentId === currentFolder?.id);
    if (searchQuery) {
      childFolders = deptFolders.filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          f.id !== deptRootFolder?.id
      );
    }

    // Fetch files
    let fileRows: RawFileRow[] = [];
    const deptFolderIds = deptFolders.map((f) => f.id);

    if (searchQuery) {
      if (deptFolderIds.length > 0) {
        fileRows = await db
          .select({
            id: files.id,
            originalName: files.originalName,
            mimeType: files.mimeType,
            size: files.size,
            folderId: files.folderId,
            uploadedBy: files.uploadedBy,
            uploadedAt: files.uploadedAt,
          })
          .from(files)
          .where(
            and(
              isNull(files.deletedAt),
              inArray(files.folderId, deptFolderIds),
              ilike(files.originalName, `%${searchQuery}%`)
            )
          )
          .orderBy(desc(files.uploadedAt))
          .execute();
      }
    } else {
      fileRows = await db
        .select({
          id: files.id,
          originalName: files.originalName,
          mimeType: files.mimeType,
          size: files.size,
          folderId: files.folderId,
          uploadedBy: files.uploadedBy,
          uploadedAt: files.uploadedAt,
        })
        .from(files)
        .where(
          and(
            isNull(files.deletedAt),
            eq(files.folderId, currentFolder.id)
          )
        )
        .orderBy(desc(files.uploadedAt))
        .execute();
    }

    // Lookup uploader names
    const uploaderIds = Array.from(new Set(fileRows.map((f) => f.uploadedBy).filter(Boolean))) as string[];
    let uploaderMap = new Map<string, { name: string; email: string }>();
    if (uploaderIds.length > 0) {
      const uploaders = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, uploaderIds))
        .execute();
      uploaderMap = new Map(uploaders.map((u) => [u.id, { name: u.name, email: u.email }]));
    }

    const enhancedFiles = fileRows.map((f) => ({
      ...f,
      uploadedAt: f.uploadedAt.toISOString(),
      uploaderName: f.uploadedBy ? uploaderMap.get(f.uploadedBy)?.name || 'Staff' : 'System',
      uploaderEmail: f.uploadedBy ? uploaderMap.get(f.uploadedBy)?.email || '' : '',
    }));

    // Department Summary Stats (Real Neon database data)
    let totalDeptFilesCount = 0;
    let totalDeptStorageBytes = 0;
    if (deptFolderIds.length > 0) {
      const allDeptFiles = await db
        .select({ size: files.size })
        .from(files)
        .where(and(isNull(files.deletedAt), inArray(files.folderId, deptFolderIds)))
        .execute();
      totalDeptFilesCount = allDeptFiles.length;
      totalDeptStorageBytes = allDeptFiles.reduce((acc, fl) => acc + (fl.size || 0), 0);
    }

    // Department Assigned Employees
    const deptEmployees = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(and(eq(users.departmentId, deptId), isNull(users.deletedAt)))
      .execute();

    // Department Activity
    const recentAuditLogs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(10)
      .execute();

    return NextResponse.json({
      department: {
        id: department.id,
        name: department.name,
      },
      currentFolder: {
        id: currentFolder.id,
        name: currentFolder.name,
        parentId: currentFolder.parentId,
        isRoot: currentFolder.id === deptRootFolder?.id,
      },
      breadcrumbs,
      folders: childFolders.map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt.toISOString(),
      })),
      files: enhancedFiles,
      statistics: {
        foldersCount: deptFolders.length,
        filesCount: totalDeptFilesCount,
        storageBytes: totalDeptStorageBytes,
        employeesCount: deptEmployees.length,
      },
      employees: deptEmployees.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        lastLoginAt: e.lastLoginAt ? e.lastLoginAt.toISOString() : null,
      })),
      activity: recentAuditLogs.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error('Error fetching department explorer:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

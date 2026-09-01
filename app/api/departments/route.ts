import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { departments, folders, files, users } from '@/src/server/drizzle/schema';
import { isNull, eq } from 'drizzle-orm';
import { ensureRootFolder } from '@/src/server/folders';
import { requireAuthUser } from '@/src/server/authorization';
import { ensureDatabaseTables } from '@/src/server/dbInit';
import { logAction } from '@/src/server/audit';
import { z } from 'zod';

const standardDepartments = [
  'Engineering Department',
  'Accounts Department',
  'HR & Administration',
  'Pre-Requirement',
  'Business',
  'Registration',
  'Workplace',
];

const CreateDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required').max(255),
});

export async function GET() {
  try {
    await ensureDatabaseTables();
    let deptList = await db.select().from(departments).execute();

    if (deptList.length === 0) {
      for (const name of standardDepartments) {
        await db.insert(departments).values({ name }).execute();
      }
      deptList = await db.select().from(departments).execute();
    }

    // Ensure departmental folders exist
    await ensureRootFolder();

    // Query active folders, files, and users
    const [allFolders, allFiles, allUsers] = await Promise.all([
      db.select().from(folders).where(isNull(folders.deletedAt)).execute(),
      db.select().from(files).where(isNull(files.deletedAt)).execute(),
      db.select().from(users).where(isNull(users.deletedAt)).execute(),
    ]);

    // Map folder to its departmentId
    const folderDeptMap = new Map<number, number>();
    for (const f of allFolders) {
      if (f.departmentId) {
        folderDeptMap.set(f.id, f.departmentId);
      }
    }

    // Enhance each department with real database metrics
    const enhancedDepartments = deptList.map((dept) => {
      const deptFolders = allFolders.filter((f) => f.departmentId === dept.id);
      const deptFolderIds = new Set(deptFolders.map((f) => f.id));

      const deptFiles = allFiles.filter((fl) => fl.folderId && deptFolderIds.has(fl.folderId));
      const storageBytes = deptFiles.reduce((sum, fl) => sum + (fl.size || 0), 0);
      const employees = allUsers.filter((u) => u.departmentId === dept.id);

      return {
        id: dept.id,
        name: dept.name,
        foldersCount: deptFolders.length,
        filesCount: deptFiles.length,
        storageBytes,
        employeesCount: employees.length,
      };
    });

    return NextResponse.json({ departments: enhancedDepartments });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({
      departments: standardDepartments.map((name, idx) => ({
        id: idx + 1,
        name,
        foldersCount: 0,
        filesCount: 0,
        storageBytes: 0,
        employeesCount: 0,
      })),
    });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireAuthUser(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const auth = authCheck.auth!;

    // Super Admin & Admin can create departments
    const isSuperAdmin = auth.role === 'super_admin' || auth.role === 'admin';
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Super Administrator or Administrator privileges required to create departments.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parse = CreateDepartmentSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parse.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const deptName = parse.data.name.trim();

    // Check if department name already exists
    const existing = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.name, deptName))
      .limit(1)
      .execute();

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Department "${deptName}" already exists.` },
        { status: 409 }
      );
    }

    // Insert department
    const inserted = await db
      .insert(departments)
      .values({ name: deptName })
      .returning({ id: departments.id, name: departments.name })
      .execute();

    const newDept = inserted[0];

    // Ensure root folder and create department root folder
    const rootId = await ensureRootFolder();
    const existingDeptFolder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.departmentId, newDept.id))
      .limit(1)
      .execute();

    let deptFolderId: number;
    if (existingDeptFolder.length === 0) {
      const folderInsert = await db
        .insert(folders)
        .values({
          name: newDept.name,
          parentId: rootId,
          departmentId: newDept.id,
        })
        .returning({ id: folders.id })
        .execute();
      deptFolderId = folderInsert[0].id;
    } else {
      deptFolderId = existingDeptFolder[0].id;
    }

    // Audit log
    await logAction(auth.user.id, 'CREATE_DEPARTMENT', 'department', String(newDept.id), {
      departmentName: newDept.name,
      rootFolderId: deptFolderId,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Department "${newDept.name}" created successfully.`,
        department: {
          id: newDept.id,
          name: newDept.name,
          foldersCount: 1,
          filesCount: 0,
          storageBytes: 0,
          employeesCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating department:', error);
    const message = error instanceof Error ? error.message : 'Failed to create department';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


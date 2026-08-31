import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { departments, folders, files, users } from '@/src/server/drizzle/schema';
import { isNull } from 'drizzle-orm';
import { ensureRootFolder } from '@/src/server/folders';

const standardDepartments = [
  'Engineering Department',
  'Accounts Department',
  'HR & Administration',
  'Pre-Requirement',
  'Business',
  'Registration',
  'Workplace',
];

export async function GET() {
  try {
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

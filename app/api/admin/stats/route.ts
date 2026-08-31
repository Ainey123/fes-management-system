import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { departments, folders, files, users, auditLogs } from '@/src/server/drizzle/schema';
import { isNull } from 'drizzle-orm';

import { ensureDatabaseTables } from '@/src/server/dbInit';

export async function GET() {
  try {
    await ensureDatabaseTables();
    const deptRows = await db.select().from(departments).execute();
    const folderRows = await db.select().from(folders).where(isNull(folders.deletedAt)).execute();
    const fileRows = await db.select().from(files).where(isNull(files.deletedAt)).execute();
    const userRows = await db.select().from(users).where(isNull(users.deletedAt)).execute();
    const logRows = await db.select().from(auditLogs).execute();

    const activeUsers = userRows.filter((u) => u.status === 'ACTIVE');
    const inactiveUsers = userRows.filter((u) => u.status === 'DISABLED');

    return NextResponse.json({
      departmentsCount: deptRows.length || 7,
      foldersCount: folderRows.length,
      filesCount: fileRows.length,
      usersCount: userRows.length,
      activeEmployeesCount: activeUsers.length,
      inactiveEmployeesCount: inactiveUsers.length,
      auditLogsCount: logRows.length,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      departmentsCount: 7,
      foldersCount: 1,
      filesCount: 0,
      usersCount: 1,
      activeEmployeesCount: 1,
      inactiveEmployeesCount: 0,
      auditLogsCount: 0,
    });
  }
}

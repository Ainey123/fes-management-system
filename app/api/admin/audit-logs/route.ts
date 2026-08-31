// app/api/admin/audit-logs/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { auditLogs, users } from '@/src/server/drizzle/schema';
import { desc, eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { ensureDatabaseTables } from '@/src/server/dbInit';

export async function GET(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;

    const rows = await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100)
      .execute();

    return NextResponse.json({
      logs: rows,
      total: rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching audit logs:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch audit logs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

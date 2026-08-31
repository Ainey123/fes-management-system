// app/api/admin/me/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { users, roles } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { ensureDatabaseTables } from '@/src/server/dbInit';

export async function GET(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const adminUser = authCheck.auth!.user;

    const userRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, adminUser.id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'Admin account not found' }, { status: 404 });
    }

    const u = userRows[0];

    let roleName = 'SUPER_ADMIN';
    if (u.roleId) {
      const roleRows = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.id, u.roleId))
        .limit(1)
        .execute();
      if (roleRows.length > 0) {
        roleName = roleRows[0].name.toUpperCase();
      }
    }

    return NextResponse.json({
      admin: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: roleName,
        status: u.status || 'ACTIVE',
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching admin account:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch admin details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

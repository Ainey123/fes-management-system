// app/api/admin/users/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { users } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { logAction } from '@/src/server/audit';
import { deleteUserSessions } from '@/src/server/auth/session';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const StatusActionSchema = z.object({
  action: z.enum(['disable', 'enable', 'delete', 'logout_sessions']),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const adminUser = authCheck.auth!.user;

    const { id } = await props.params;

    const body = await request.json();
    const parseResult = StatusActionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { action } = parseResult.data;

    // Check user exists
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email, status: users.status })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = userRows[0];

    // Cannot modify status of oneself (except session logout)
    if (id === adminUser.id && action !== 'logout_sessions') {
      return NextResponse.json(
        { error: 'Cannot disable or delete your own Super Administrator account.' },
        { status: 400 }
      );
    }

    if (action === 'logout_sessions') {
      await deleteUserSessions(id, id === adminUser.id ? authCheck.auth!.sessionId : undefined);
      await logAction(adminUser.id, 'LOGOUT_USER_SESSIONS', 'user', id, {
        userName: targetUser.name,
        userEmail: targetUser.email,
      });
      return NextResponse.json({
        success: true,
        message: `Active sessions for ${targetUser.name} have been revoked.`,
        status: targetUser.status,
      });
    }

    if (action === 'disable') {
      await db
        .update(users)
        .set({ status: 'DISABLED', updatedAt: new Date() })
        .where(eq(users.id, id))
        .execute();

      // Revoke any active sessions immediately
      await deleteUserSessions(id);

      await logAction(adminUser.id, 'DISABLE_USER', 'user', id, {
        userName: targetUser.name,
        userEmail: targetUser.email,
      });

      return NextResponse.json({
        success: true,
        message: `Employee ${targetUser.name} has been disabled.`,
        status: 'DISABLED',
      });
    } else if (action === 'enable') {
      await db
        .update(users)
        .set({ status: 'ACTIVE', deletedAt: null, updatedAt: new Date() })
        .where(eq(users.id, id))
        .execute();

      await logAction(adminUser.id, 'ENABLE_USER', 'user', id, {
        userName: targetUser.name,
        userEmail: targetUser.email,
      });

      return NextResponse.json({
        success: true,
        message: `Employee ${targetUser.name} has been re-enabled.`,
        status: 'ACTIVE',
      });
    } else if (action === 'delete') {
      await db
        .update(users)
        .set({ status: 'DELETED', deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, id))
        .execute();

      // Revoke sessions
      await deleteUserSessions(id);

      await logAction(adminUser.id, 'DELETE_USER', 'user', id, {
        userName: targetUser.name,
        userEmail: targetUser.email,
        softDeleted: true,
      });

      return NextResponse.json({
        success: true,
        message: `Employee ${targetUser.name} has been deleted.`,
        status: 'DELETED',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Error updating user status:', error);
    const message = error instanceof Error ? error.message : 'Failed to update user status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// app/api/admin/change-password/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { users } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { comparePassword, hashPassword } from '@/src/server/auth/bcrypt';
import { logAction } from '@/src/server/audit';
import { deleteUserSessions } from '@/src/server/auth/session';
import { ensureDatabaseTables } from '@/src/server/dbInit';

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmNewPassword: z.string().min(1, 'Password confirmation is required'),
    invalidateOtherSessions: z.boolean().default(true),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'New passwords do not match',
    path: ['confirmNewPassword'],
  });

export async function POST(request: Request) {
  try {
    await ensureDatabaseTables();

    const authCheck = await requireSuperAdmin(request);
    if (authCheck.errorResponse) return authCheck.errorResponse;
    const { user: adminUser, sessionId } = authCheck.auth!;

    const body = await request.json();
    const parseResult = ChangePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, invalidateOtherSessions } = parseResult.data;

    // Fetch current user hash
    const userRows = await db
      .select({ id: users.id, passwordHash: users.passwordHash, email: users.email })
      .from(users)
      .where(eq(users.id, adminUser.id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'Admin account not found' }, { status: 404 });
    }

    const currentHash = userRows[0].passwordHash;

    // Verify current password using bcrypt
    const isCurrentValid = await comparePassword(currentPassword, currentHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: 'Incorrect current password. Please try again.' },
        { status: 401 }
      );
    }

    // Check that new password is not identical to old password
    const isSamePassword = await comparePassword(newPassword, currentHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'New password must be different from your current password.' },
        { status: 400 }
      );
    }

    // Securely hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update database
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, adminUser.id))
      .execute();

    // Invalidate other active sessions if requested, keeping current session intact
    if (invalidateOtherSessions) {
      await deleteUserSessions(adminUser.id, sessionId);
    }

    // Audit log - STRICTLY NEVER log the plaintext password or password hash
    await logAction(adminUser.id, 'ADMIN_PASSWORD_CHANGED', 'user', adminUser.id, {
      adminEmail: userRows[0].email,
      otherSessionsInvalidated: invalidateOtherSessions,
    });

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully.',
      otherSessionsInvalidated: invalidateOtherSessions,
    });
  } catch (error: unknown) {
    console.error('Error changing admin password:', error);
    const message = error instanceof Error ? error.message : 'Failed to change password';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

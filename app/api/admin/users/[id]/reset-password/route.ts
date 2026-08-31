// app/api/admin/users/[id]/reset-password/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/server/db';
import { users } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { requireSuperAdmin } from '@/src/server/authorization';
import { hashPassword } from '@/src/server/auth/bcrypt';
import { logAction } from '@/src/server/audit';
import { deleteUserSessions } from '@/src/server/auth/session';
import { ensureDatabaseTables } from '@/src/server/dbInit';
import crypto from 'crypto';

const ResetPasswordSchema = z.object({
  mode: z.enum(['auto', 'manual']),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()-_=+';
  const all = upper + lower + digits + symbols;

  let pwd = '';
  pwd += upper[crypto.randomInt(upper.length)];
  pwd += lower[crypto.randomInt(lower.length)];
  pwd += digits[crypto.randomInt(digits.length)];
  pwd += symbols[crypto.randomInt(symbols.length)];

  for (let i = pwd.length; i < length; i++) {
    pwd += all[crypto.randomInt(all.length)];
  }

  return pwd.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

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

    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = userRows[0];

    const body = await request.json();
    const parseResult = ResetPasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { mode, newPassword } = parseResult.data;

    let plaintextPassword = '';
    if (mode === 'auto') {
      plaintextPassword = generateSecurePassword(14);
    } else {
      if (!newPassword || newPassword.trim().length < 8) {
        return NextResponse.json(
          { error: 'A manual password must be at least 8 characters long.' },
          { status: 400 }
        );
      }
      plaintextPassword = newPassword.trim();
    }

    // Securely hash with bcrypt
    const passwordHash = await hashPassword(plaintextPassword);

    // Update in database
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .execute();

    // Revoke all existing sessions for this user so old password sessions immediately stop working
    await deleteUserSessions(id);

    // Audit log - STRICTLY NEVER log the plaintext password or password hash
    await logAction(adminUser.id, 'PASSWORD_RESET', 'user', id, {
      userName: targetUser.name,
      userEmail: targetUser.email,
      resetMode: mode,
      sessionsRevoked: true,
    });

    // Return the plaintext temporary password ONLY in this immediate response
    return NextResponse.json({
      success: true,
      message: 'Password reset successfully.',
      temporaryPassword: plaintextPassword,
      resetMode: mode,
    });
  } catch (error: unknown) {
    console.error('Error resetting password:', error);
    const message = error instanceof Error ? error.message : 'Failed to reset password';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

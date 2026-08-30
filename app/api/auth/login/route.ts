import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { users, roles } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { comparePassword } from '@/src/server/auth/bcrypt';
import { createSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const userRows = await db
    .select({ id: users.id, passwordHash: users.passwordHash, roleId: users.roleId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .execute();
  if (userRows.length === 0) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const user = userRows[0];
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  let roleName = 'employee';
  if (user.roleId) {
    const roleRows = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1)
      .execute();
    if (roleRows.length > 0) {
      roleName = roleRows[0].name;
    }
  }

  const { sessionId, expiresAt } = await createSession(user.id);
  const cookieOptions = {
    httpOnly: true,
    path: '/',
    expires: expiresAt,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
  const cookieHeader = (await import('cookie')).serialize('session_id', sessionId, cookieOptions);
  const response = NextResponse.json({ success: true, user: { id: user.id, role: roleName } });
  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}

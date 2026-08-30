// app/api/setup/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { users, roles } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/src/server/auth/bcrypt';
import { createSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
  const { email, name, password } = await request.json();

  // Check if a super admin already exists
  const superAdminRole = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'super_admin'))
    .limit(1)
    .execute();

  let roleId: number;
  if (superAdminRole.length === 0) {
    const insertRes = await db
      .insert(roles)
      .values({ name: 'super_admin' })
      .returning({ id: roles.id })
      .execute();
    roleId = insertRes[0].id;
  } else {
    roleId = superAdminRole[0].id;
    // If a super admin user already exists, block creation
    const existingSuper = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleId, roleId))
      .limit(1)
      .execute();
    if (existingSuper.length > 0) {
      return NextResponse.json({ error: 'Super admin already set up' }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(password);

  const inserted = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      roleId,
    })
    .returning({ id: users.id })
    .execute();

  const userId = inserted[0].id;

  // Create session
  const { sessionId, expiresAt } = await createSession(userId);
  const cookieOptions = {
    httpOnly: true,
    path: '/',
    expires: expiresAt,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
  const cookieHeader = (await import('cookie')).serialize('session_id', sessionId, cookieOptions);
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}

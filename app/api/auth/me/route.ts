import { NextResponse } from 'next/server';
import { getSession } from '@/src/server/auth/session';
import { db } from '@/src/server/db';
import { roles } from '@/src/server/drizzle/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const parsed = (await import('cookie')).parse(cookieHeader);
  const sessionId = parsed['session_id'];

  if (!sessionId) {
    return NextResponse.json({ authenticated: false });
  }

  const sessionData = await getSession(sessionId);
  if (!sessionData) {
    return NextResponse.json({ authenticated: false });
  }

  let roleName = 'employee';
  if (sessionData.user.roleId) {
    const roleRows = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, sessionData.user.roleId))
      .limit(1)
      .execute();
    if (roleRows.length > 0) {
      roleName = roleRows[0].name;
    }
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: sessionData.user.id,
      email: sessionData.user.email,
      name: sessionData.user.name,
      role: roleName,
    },
  });
}

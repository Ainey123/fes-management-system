import { db } from '../db';
import { sessions, users } from '../drizzle/schema';
import { and, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/** Create a new session for a given user id. Returns session id and expiration */
export async function createSession(userId: string, maxAgeSeconds = 7 * 24 * 60 * 60) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
  await db.insert(sessions).values({ id: sessionId, userId, expiresAt }).execute();
  return { sessionId, expiresAt };
}

/** Retrieve session and associated user if valid */
export async function getSession(sessionId: string) {
  const sessionRows = await db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt, userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1)
    .execute();
  if (sessionRows.length === 0) return null;
  const s = sessionRows[0];
  if (new Date(s.expiresAt) < new Date()) return null; // expired

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      roleId: users.roleId,
      status: users.status,
      deletedAt: users.deletedAt,
      departmentId: users.departmentId,
    })
    .from(users)
    .where(eq(users.id, s.userId as string))
    .limit(1)
    .execute();
  if (userRows.length === 0) return null;
  const u = userRows[0];
  if (u.deletedAt || u.status === 'DISABLED') return null;

  return { session: s, user: u };
}

/** Extract authenticated user id from request cookie */
export async function getSessionUserId(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const parsed = (await import('cookie')).parse(cookieHeader);
  const sessionId = parsed['session_id'];
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return { userId: session.user.id };
}

/** Extract full session and user from request cookie */
export async function getSessionData(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const parsed = (await import('cookie')).parse(cookieHeader);
  const sessionId = parsed['session_id'];
  if (!sessionId) return null;
  const data = await getSession(sessionId);
  if (!data) return null;
  return { sessionId, ...data };
}

/** Delete a single session */
export async function deleteSession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId)).execute();
}

/** Delete all sessions for a user, optionally preserving one */
export async function deleteUserSessions(userId: string, exceptSessionId?: string) {
  if (exceptSessionId) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)))
      .execute();
  } else {
    await db.delete(sessions).where(eq(sessions.userId, userId)).execute();
  }
}


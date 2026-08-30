// src/server/auth/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './session';

/**
 * Middleware that extracts the session cookie, validates it and attaches the user
 * object to the request via `request.headers` (a custom header `x-user-id`).
 * Handlers can read `request.headers.get('x-user-id')` to know the authenticated
 * user. If no valid session exists, the user is considered unauthenticated.
 */
export async function authMiddleware(req: NextRequest): Promise<NextResponse> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const parsed = (await import('cookie')).parse(cookieHeader);
  const sessionId = parsed['session_id'];

  if (!sessionId) {
    // No session – return response unchanged (unauthenticated)
    return NextResponse.next();
  }

  const sessionData = await getSession(sessionId);
  if (!sessionData) {
    // Invalid or expired – clear cookie
    const res = NextResponse.next();
    res.headers.append(
      'Set-Cookie',
      (await import('cookie')).serialize('session_id', '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    );
    return res;
  }

  // Attach user id to request via a custom header (since request is immutable)
  const res = NextResponse.next();
  res.headers.set('x-user-id', sessionData.user.id);
  res.headers.set('x-user-role-id', String(sessionData.user.roleId ?? ''));
  return res;
}

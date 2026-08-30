import { NextResponse } from 'next/server';
import { deleteSession } from '@/src/server/auth/session';

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const parsed = (await import('cookie')).parse(cookieHeader);
  const sessionId = parsed['session_id'];

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const cookieHeaderValue = (await import('cookie')).serialize('session_id', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', cookieHeaderValue);
  return response;
}

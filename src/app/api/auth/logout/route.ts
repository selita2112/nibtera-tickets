
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { shouldUseSecureCookies } from '@/lib/cookie';

const JWT_SECRET = process.env.JWT_SECRET;

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if (refreshToken && JWT_SECRET) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId?: string; sessionId?: string; type?: string };
        if (decoded?.userId && decoded?.sessionId) {
          await prisma.session.updateMany({
            where: { id: decoded.sessionId, userId: decoded.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      } catch (e) {
        console.warn('[LOGOUT] Refresh token verify failed, but proceeding to clear cookies.');
      }
    }

    const response = NextResponse.json({ message: 'Logout successful.' }, { status: 200 });
    const secure = shouldUseSecureCookies();

    // Clear cookies by setting an expired date
    response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
    response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });
    
    return response;
  } catch (error) {
    console.error('[LOGOUT_ERROR]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

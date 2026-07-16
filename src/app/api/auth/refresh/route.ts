
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { hashRefreshToken } from '@/lib/session';
import { checkIpLockout, getClientIp, recordIpFailure, resetIpFailures } from '@/lib/rate-limit';
import { shouldUseSecureCookies } from '@/lib/cookie';

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 15; // 15 minutes
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET environment variable is not set.');
    return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
  }

  const ip = getClientIp(req);
  const ipLock = await checkIpLockout(ip);
  if (ipLock.locked) {
    return NextResponse.json(
      { message: `Too many attempts. Please try again in ${ipLock.timeLeftSeconds} seconds.` },
      { status: 429 }
    );
  }

  const cookieStore = await cookies();
  const refreshTokenFromCookie = cookieStore.get('refresh_token')?.value;

  if (!refreshTokenFromCookie) {
    await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });
    return NextResponse.json({ message: 'No refresh token provided.' }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(refreshTokenFromCookie, JWT_SECRET) as {
      userId: string;
      tokenVersion?: number;
      sessionId?: string;
      type: 'access' | 'refresh';
    };

    if (decoded.type !== 'refresh') {
      await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });
      return NextResponse.json({ message: 'Invalid token type.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    if (!user) {
      await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });
      return NextResponse.json({ message: 'User not found.' }, { status: 401 });
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });
      const response = NextResponse.json({ message: 'Session has been invalidated.' }, { status: 401 });
      const secure = shouldUseSecureCookies();
      response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });
      response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
      return response;
    }

    if (!decoded.sessionId) {
      await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });
      const response = NextResponse.json({ message: 'Invalid session.' }, { status: 401 });
      const secure = shouldUseSecureCookies();
      response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });
      response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
      return response;
    }

    const session = await prisma.session.findFirst({
      where: { id: decoded.sessionId, userId: user.id, revokedAt: null },
      select: { refreshTokenHash: true },
    });
    if (!session) {
      await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });
      const response = NextResponse.json({ message: 'Session has been revoked.' }, { status: 401 });
      const secure = shouldUseSecureCookies();
      response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });
      response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
      return response;
    }

    if (session.refreshTokenHash !== hashRefreshToken(refreshTokenFromCookie)) {
      // Possible token theft/reuse: revoke session immediately
      await prisma.session.update({
        where: { id: decoded.sessionId },
        data: { revokedAt: new Date() },
      });
      const response = NextResponse.json({ message: 'Invalid refresh token.' }, { status: 401 });
      const secure = shouldUseSecureCookies();
      response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });
      response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
      return response;
    }

    // --- Issue new access token ---
    const userPermissions = user.role.rolePermissions.map(p => p.permission.name);

    const newAccessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role.name,
        permissions: userPermissions,
        tokenVersion: user.tokenVersion,
        sessionId: decoded.sessionId,
        type: 'access',
      },
      JWT_SECRET,
      { expiresIn: `${ACCESS_TOKEN_EXPIRES_IN_SECONDS}s` }
    );

    // --- Rotate refresh token ---
    const newRefreshToken = jwt.sign(
      {
        userId: user.id,
        tokenVersion: user.tokenVersion,
        sessionId: decoded.sessionId,
        type: 'refresh',
      },
      JWT_SECRET,
      { expiresIn: `${REFRESH_TOKEN_EXPIRES_IN_SECONDS}s` }
    );

    const response = NextResponse.json({ success: true, message: 'Token refreshed' });
    const secure = shouldUseSecureCookies();

    response.cookies.set('auth_token', newAccessToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    });

    response.cookies.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    });

    await prisma.session.update({
      where: { id: decoded.sessionId },
      data: { refreshTokenHash: hashRefreshToken(newRefreshToken), lastUsedAt: new Date() },
    });

    await resetIpFailures(ip);

    return response;
  } catch (error) {
    console.error('[REFRESH_TOKEN_ERROR]', error);
    await recordIpFailure(ip, { maxAttempts: 25, lockoutSeconds: 300 });

    const response = NextResponse.json({ message: 'Invalid refresh token.' }, { status: 401 });
    const secure = shouldUseSecureCookies();
    response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });
    response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
    return response;
  }
}

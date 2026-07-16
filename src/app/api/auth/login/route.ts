
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { isPasswordExpired } from '@/lib/password-policy';
import { getMaxActiveSessions, hashRefreshToken } from '@/lib/session';
import crypto from 'crypto';
import { shouldUseSecureCookies } from '@/lib/cookie';
import { normalizeEthiopianPhoneStrict } from '@/lib/utils';
import {
  checkIpLockout,
  checkUserLockout,
  getClientIp,
  recordIpFailure,
  recordUserFailure,
  resetIpFailures,
  resetUserFailures,
} from '@/lib/rate-limit';

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 15; // 15 minutes
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set.');
    }

    const ip = getClientIp(req);
    const ipLock = await checkIpLockout(ip);
    if (ipLock.locked) {
      return NextResponse.json(
        { message: `Too many attempts. Please try again in ${ipLock.timeLeftSeconds} seconds.` },
        { status: 429 }
      );
    }

    const { phoneNumber, password } = await req.json();

    if (!phoneNumber || !password) {
      return NextResponse.json({ message: 'Phone number and password are required.' }, { status: 400 });
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeEthiopianPhoneStrict(phoneNumber);
    } catch (e: any) {
      return NextResponse.json({ message: e?.message || 'Invalid phone number.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    if (!user || !user.password) {
      await recordIpFailure(ip, {
        maxAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 10),
        lockoutSeconds: Number(process.env.LOGIN_IP_LOCKOUT_SECONDS || 60),
      });
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    const userLock = await checkUserLockout(user);
    if (userLock.locked) {
      return NextResponse.json(
        { message: `Account temporarily locked. Please try again in ${userLock.timeLeftSeconds} seconds.` },
        { status: 429 }
      );
    }

    // Avoid account enumeration: do not reveal whether the account exists/active.
    if (user.status !== 'ACTIVE') {
      await recordIpFailure(ip, {
        maxAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 10),
        lockoutSeconds: Number(process.env.LOGIN_IP_LOCKOUT_SECONDS || 60),
      });
      await recordUserFailure(user.id, {
        maxAttempts: Number(process.env.MAX_USER_LOGIN_ATTEMPTS || 5),
        lockoutSeconds: Number(process.env.USER_LOCKOUT_SECONDS || 300),
      });
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await recordIpFailure(ip, {
        maxAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 10),
        lockoutSeconds: Number(process.env.LOGIN_IP_LOCKOUT_SECONDS || 60),
      });
      await recordUserFailure(user.id, {
        maxAttempts: Number(process.env.MAX_USER_LOGIN_ATTEMPTS || 5),
        lockoutSeconds: Number(process.env.USER_LOCKOUT_SECONDS || 300),
      });
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    // Reset attempts on successful login
    await resetIpFailures(ip);
    await resetUserFailures(user.id);

    // Enforce password age / periodic re-validation
    if (isPasswordExpired(user.passwordUpdatedAt)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordChangeRequired: true },
      });
      user.passwordChangeRequired = true;
    }

    const userPermissions = user.role.rolePermissions.map(p => p.permission.name);

    // Invalidate existing sessions on new login (concurrency control).
    // This bumps tokenVersion so old access tokens are rejected immediately.
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    const tokenVersion = updatedUser.tokenVersion;

    const sessionId = crypto.randomUUID();

    // --- Create Access Token ---
    const accessTokenPayload = {
      userId: user.id,
      role: user.role.name,
      permissions: userPermissions,
      tokenVersion: tokenVersion,
      sessionId,
      type: 'access' as 'access',
    };
    const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, {
      expiresIn: `${ACCESS_TOKEN_EXPIRES_IN_SECONDS}s`,
    });

    // --- Create Refresh Token ---
    const refreshTokenPayload = {
      userId: user.id,
      tokenVersion: tokenVersion,
      sessionId,
      type: 'refresh' as 'refresh',
    };
    const refreshToken = jwt.sign(refreshTokenPayload, JWT_SECRET, {
      expiresIn: `${REFRESH_TOKEN_EXPIRES_IN_SECONDS}s`,
    });

    const maxSessions = getMaxActiveSessions();
    // Revoke all existing sessions if we only allow one, otherwise enforce cap.
    if (maxSessions === 1) {
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      const activeSessions = await prisma.session.findMany({
        where: { userId: user.id, revokedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const overflow = activeSessions.length - (maxSessions - 1);
      if (overflow > 0) {
        const toRevoke = activeSessions.slice(0, overflow).map(s => s.id);
        await prisma.session.updateMany({
          where: { id: { in: toRevoke } },
          data: { revokedAt: new Date() },
        });
      }
    }

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: req.headers.get('user-agent') || undefined,
        ip: ip?.toString(),
        lastUsedAt: new Date(),
      },
    });
    
    const { password: _, ...userWithoutPassword } = user;
    const responseUser = { ...userWithoutPassword, tokenVersion: tokenVersion, permissions: userPermissions };

    const response = NextResponse.json({
      message: 'Login successful.',
      user: responseUser,
    }, { status: 200 });
    const secure = shouldUseSecureCookies();

    response.cookies.set('auth_token', accessToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: '/',
        maxAge: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    });

    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    });

    return response;

  } catch (error: any) {
    console.error('[LOGIN_ERROR]', error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}

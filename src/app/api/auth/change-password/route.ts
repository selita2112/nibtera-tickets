
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { hasSpecialCharacter, normalizeEthiopianPhoneStrict } from '@/lib/utils';
import { cookies } from 'next/headers';
import { validatePasswordAgainstBreaches } from '@/lib/password-policy';
import { checkIpLockout, getClientIp, recordIpFailure } from '@/lib/rate-limit';
import { shouldUseSecureCookies } from '@/lib/cookie';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLock = await checkIpLockout(ip);
    if (ipLock.locked) {
      return NextResponse.json(
        { errors: [`Too many attempts. Please try again in ${ipLock.timeLeftSeconds} seconds.`] },
        { status: 429 }
      );
    }

    const { phoneNumber, currentPassword, newPassword } = await req.json();

    if (!phoneNumber || !currentPassword || !newPassword) {
      await recordIpFailure(ip, { maxAttempts: 15, lockoutSeconds: 300 });
      return NextResponse.json({ errors: ['All fields are required.'] }, { status: 400 });
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeEthiopianPhoneStrict(phoneNumber);
    } catch (e: any) {
      await recordIpFailure(ip, { maxAttempts: 15, lockoutSeconds: 300 });
      return NextResponse.json({ errors: [e?.message || 'Invalid phone number.'] }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user || !user.password) {
      await recordIpFailure(ip, { maxAttempts: 15, lockoutSeconds: 300 });
      return NextResponse.json({ errors: ['Invalid credentials.'] }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      await recordIpFailure(ip, { maxAttempts: 15, lockoutSeconds: 300 });
      return NextResponse.json({ errors: ['Incorrect current password.'] }, { status: 400 });
    }

    // Server-side enforcement for new password complexity (mirror client rules)
    if (newPassword.length < 8
        || !/[a-z]/.test(newPassword)
        || !/[A-Z]/.test(newPassword)
        || !/[0-9]/.test(newPassword)
        || !hasSpecialCharacter(newPassword)) {
      await recordIpFailure(ip, { maxAttempts: 15, lockoutSeconds: 300 });
      return NextResponse.json({ errors: ['New password does not meet complexity requirements.'] }, { status: 400 });
    }

    const breachCheck = await validatePasswordAgainstBreaches(newPassword);
    if (!breachCheck.ok && breachCheck.code !== 'POLICY_DISABLED') {
      await recordIpFailure(ip, { maxAttempts: 15, lockoutSeconds: 300 });
      return NextResponse.json({ errors: [breachCheck.reason] }, { status: 400 });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Increment tokenVersion to invalidate all old sessions
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHashedPassword,
        passwordUpdatedAt: new Date(),
        passwordChangeRequired: false,
        tokenVersion: { increment: 1 },
      },
    });

    // Revoke all existing sessions for this user
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Clear cookies upon successful password change to force re-login
    const response = NextResponse.json({ success: true, message: 'Password updated successfully. Please log in again.' }, { status: 200 });
    const secure = shouldUseSecureCookies();
    response.cookies.set('auth_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: -1 });
    response.cookies.set('refresh_token', '', { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth/refresh', maxAge: -1 });

    return response;

  } catch (error) {
    console.error('[CHANGE_PASSWORD_ERROR]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

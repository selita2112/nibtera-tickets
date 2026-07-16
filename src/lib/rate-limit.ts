import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

function now() {
  return new Date();
}

function toSeconds(v: string | undefined, fallback: number) {
  const n = v ? Number(v) : fallback;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toInt(v: string | undefined, fallback: number) {
  const n = v ? Number(v) : fallback;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = (req.ip ?? forwarded ?? '127.0.0.1').toString();
  // If multiple IPs, take first
  return ip.split(',')[0]?.trim() || '127.0.0.1';
}

export async function checkIpLockout(ip: string) {
  const record = await prisma.failedIpAttempt.findUnique({ where: { ip } });
  if (record?.lockoutUntil && record.lockoutUntil.getTime() > Date.now()) {
    const timeLeftSeconds = Math.ceil((record.lockoutUntil.getTime() - Date.now()) / 1000);
    return { locked: true as const, timeLeftSeconds };
  }
  // If lockout expired, reset attempts
  if (record?.lockoutUntil && record.lockoutUntil.getTime() <= Date.now() && record.attempts > 0) {
    await prisma.failedIpAttempt.update({
      where: { ip },
      data: { attempts: 0, lockoutUntil: null },
    });
  }
  return { locked: false as const, timeLeftSeconds: 0 };
}

export async function recordIpFailure(ip: string, opts?: { maxAttempts?: number; lockoutSeconds?: number }) {
  const maxAttempts = opts?.maxAttempts ?? toInt(process.env.MAX_IP_ATTEMPTS, 10);
  const lockoutSeconds = opts?.lockoutSeconds ?? toSeconds(process.env.IP_LOCKOUT_SECONDS, 60);

  const existing = await prisma.failedIpAttempt.findUnique({ where: { ip } });
  const nextAttempts = (existing?.attempts ?? 0) + 1;

  const shouldLock = nextAttempts >= maxAttempts;
  if (shouldLock) {
    console.warn(`[RATE_LIMIT] IP locked out: ip=${ip} lockoutSeconds=${lockoutSeconds}`);
  }
  await prisma.failedIpAttempt.upsert({
    where: { ip },
    create: {
      ip,
      attempts: shouldLock ? 0 : nextAttempts,
      lockoutUntil: shouldLock ? new Date(Date.now() + lockoutSeconds * 1000) : null,
    },
    update: {
      attempts: shouldLock ? 0 : nextAttempts,
      lockoutUntil: shouldLock ? new Date(Date.now() + lockoutSeconds * 1000) : null,
    },
  });
}

export async function resetIpFailures(ip: string) {
  await prisma.failedIpAttempt.updateMany({
    where: { ip },
    data: { attempts: 0, lockoutUntil: null },
  });
}

export async function checkUserLockout(user: { lockoutUntil: Date | null; failedLoginAttempts: number }) {
  if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
    const timeLeftSeconds = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 1000);
    return { locked: true as const, timeLeftSeconds };
  }
  return { locked: false as const, timeLeftSeconds: 0 };
}

export async function recordUserFailure(userId: string, opts?: { maxAttempts?: number; lockoutSeconds?: number }) {
  const maxAttempts = opts?.maxAttempts ?? toInt(process.env.MAX_USER_ATTEMPTS, 5);
  const lockoutSeconds = opts?.lockoutSeconds ?? toSeconds(process.env.USER_LOCKOUT_SECONDS, 300);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true, lockoutUntil: true },
  });
  if (!user) return;

  // If prior lockout expired, reset counter
  const lockoutExpired = user.lockoutUntil && user.lockoutUntil.getTime() <= Date.now();
  const baseAttempts = lockoutExpired ? 0 : user.failedLoginAttempts;
  const nextAttempts = baseAttempts + 1;

  const shouldLock = nextAttempts >= maxAttempts;
  if (shouldLock) {
    console.warn(`[RATE_LIMIT] User locked out: userId=${userId} lockoutSeconds=${lockoutSeconds}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: shouldLock ? 0 : nextAttempts,
      lockoutUntil: shouldLock ? new Date(Date.now() + lockoutSeconds * 1000) : null,
    },
  });
}

export async function resetUserFailures(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockoutUntil: null },
  });
}


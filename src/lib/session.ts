import crypto from 'crypto';

export function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function getMaxActiveSessions() {
  const raw = process.env.MAX_ACTIVE_SESSIONS;
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}


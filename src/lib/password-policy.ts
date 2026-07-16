import crypto from 'crypto';

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; reason: string; code: 'TOO_COMMON' | 'PWNED' | 'POLICY_DISABLED' | 'HIBP_ERROR' };

const DEFAULT_COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'letmein',
]);

function sha1Hex(input: string) {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase();
}

export async function isPwnedPassword(password: string): Promise<{ pwned: boolean; count?: number }> {
  const hash = sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  // K-anonymity endpoint; does not send the password or full hash.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'EventsApp/1.0 (password policy)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      return { pwned: false };
    }

    const body = await res.text();
    const lines = body.split('\n');
    for (const line of lines) {
      const [rangeSuffixRaw, countRaw] = line.trim().split(':');
      if (!rangeSuffixRaw || !countRaw) continue;
      if (rangeSuffixRaw.toUpperCase() === suffix) {
        const count = Number(countRaw);
        return { pwned: true, count: Number.isFinite(count) ? count : undefined };
      }
    }
    return { pwned: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function validatePasswordAgainstBreaches(password: string): Promise<PasswordPolicyResult> {
  const enabled = (process.env.ENFORCE_BREACHED_PASSWORD_CHECK || 'true').toLowerCase() === 'true';
  if (!enabled) return { ok: false, code: 'POLICY_DISABLED', reason: 'Breached password check is disabled.' };

  const normalized = password.trim().toLowerCase();
  if (DEFAULT_COMMON_PASSWORDS.has(normalized)) {
    return { ok: false, code: 'TOO_COMMON', reason: 'Password is too common.' };
  }

  try {
    const { pwned } = await isPwnedPassword(password);
    if (pwned) {
      return { ok: false, code: 'PWNED', reason: 'Password has appeared in a known data breach.' };
    }
    return { ok: true };
  } catch {
    // Fail closed for security by default.
    const failClosed = (process.env.HIBP_FAIL_CLOSED || 'true').toLowerCase() === 'true';
    if (failClosed) {
      return { ok: false, code: 'HIBP_ERROR', reason: 'Unable to validate password against breached list. Please try again.' };
    }
    return { ok: true };
  }
}

export function isPasswordExpired(passwordUpdatedAt: Date | null | undefined): boolean {
  const maxAgeDays = Number(process.env.MAX_PASSWORD_AGE_DAYS || 0);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return false;
  if (!passwordUpdatedAt) return true;

  const ageMs = Date.now() - passwordUpdatedAt.getTime();
  const maxMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return ageMs > maxMs;
}


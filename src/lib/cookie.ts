export function shouldUseSecureCookies() {
  // Enforce Secure cookies by default. Allow explicit opt-out for local HTTP dev.
  const override = (process.env.COOKIE_SECURE || '').toLowerCase();
  if (override === 'false' || override === '0') return false;
  return true;
}


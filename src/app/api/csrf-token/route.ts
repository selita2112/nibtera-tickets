
import { NextResponse, NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import { normalizePhoneNumber } from '@/lib/utils';
import { shouldUseSecureCookies } from '@/lib/cookie';

const JWT_SECRET = process.env.JWT_SECRET;

// This endpoint generates a synchronized pair of CSRF tokens and also sets guest session data.
export async function GET(req: NextRequest) {
  const token = nanoid(32);
  const response = NextResponse.json({ message: 'Tokens set' });
  const { searchParams } = new URL(req.url);
  const secure = shouldUseSecureCookies();

  // Set the secret token in an HttpOnly cookie
  response.cookies.set('csrf_secret', token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
  });
  
  // Set the readable token in a regular cookie
  response.cookies.set('csrf_token', token, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
  });

  // --- New Logic: Set phone number from SuperApp query parameter ---
  const superAppToken = searchParams.get('token');
  if (superAppToken && JWT_SECRET) {
      try {
          const decoded = jwt.verify(superAppToken, JWT_SECRET) as { phoneNumber: string, userId: string };
          const normalized = normalizePhoneNumber(decoded.phoneNumber);
          if (normalized) {
                response.cookies.set('phone_number', normalized, {
                  httpOnly: false, // Make it readable by client-side JS
                  secure,
                  sameSite: 'strict',
                  path: '/',
                  maxAge: 60 * 60 * 24 * 7, // Set for 1 week
                });
              console.log('[CSRF Endpoint] SuperApp phone number cookie set for', normalized);
          }
      } catch (error) {
          console.error('[CSRF Endpoint] Invalid SuperApp token provided:', error);
      }
  }
  
  return response;
}

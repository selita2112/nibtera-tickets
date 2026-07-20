import { NextRequest, NextResponse } from 'next/server';
import { getTicketsForUser } from '@/lib/actions';
import { verifyAuth } from '@/lib/auth-middleware';

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await verifyAuth(req);

    const phoneNumberParam = req.nextUrl.searchParams.get('phoneNumber');
    const userId = req.nextUrl.searchParams.get('userId') || undefined;

    // A logged-in user always uses their real session.
    // A true guest (no session cookie at all) is allowed through IF they
    // explicitly provide their own phoneNumber. getTicketsForUser already
    // has a full 'Guest' branch that only returns tickets matching that
    // exact phone number.
    let requester = sessionUser;
    if (!requester) {
      if (!phoneNumberParam) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      requester = {
        id: 'guest',
        role: { name: 'Guest' },
        phoneNumber: phoneNumberParam,
      } as any;
    }

    const tickets = await getTicketsForUser(requester, userId, phoneNumberParam || undefined);
    return NextResponse.json({ data: tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch tickets';
    const status = message === 'Permission denied.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
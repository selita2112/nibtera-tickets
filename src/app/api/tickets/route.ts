
import { NextRequest, NextResponse } from 'next/server';
import { getTicketsForUser } from '@/lib/actions';
import { verifyAuth } from '@/lib/auth-middleware';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const phoneNumberParam = req.nextUrl.searchParams.get('phoneNumber');
    const userId = req.nextUrl.searchParams.get('userId') || undefined;

    const tickets = await getTicketsForUser(user, userId, phoneNumberParam || undefined);
    return NextResponse.json({ data: tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch tickets';
    const status = message === 'Permission denied.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

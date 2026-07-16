
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set.');
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ status: 'NOT_AUTHENTICATED' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;

    if (!userId) {
      return NextResponse.json({ status: 'INVALID_TOKEN' }, { status: 401 });
    }

    // Find the latest pendingOrder for this user (either PENDING/COMPLETED/FAILED)
    const order = await prisma.pendingOrder.findFirst({
      where: {
        AND: [
          { attendeeData: { path: ['userId'], equals: userId } as any },
          { status: { in: ['PENDING', 'COMPLETED', 'FAILED'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true, transactionId: true, attendeeId: true },
    });

    if (!order) {
      return NextResponse.json({ status: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('by-session status error', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-middleware';
import { buildPhoneVariants } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ transactionId: string }> }
): Promise<NextResponse> {
  const { transactionId } = await context.params;

  if (!transactionId) {
    return NextResponse.json(
      { error: 'Transaction ID is required.' },
      { status: 400 }
    );
  }

  // 1. Enforce Authentication: Verify the user making the request.
// 1. Try to identify a logged-in/session user, if one exists. Guests (no
// session cookie) are allowed through — they're handled in the else
// branch below by trusting the transactionId itself.
const user = await verifyAuth(request);

try {
    // 2. Enforce Authorization: Build a query that ONLY matches orders belonging to the authenticated user.
   // 2. If we have a session, enforce strict ownership (unchanged from before).
//    If there's no session at all (a true guest arriving from a hosted
//    checkout redirect like YagoutPay), fall back to trusting the
//    transactionId itself — it's an unguessable UUID the client only has
//    because they just created/paid for this exact order, the same trust
//    model /api/payment/pending-order and /api/payment/yagout/initiate
//    already use. We still only ever return status + transactionId below,
//    never attendeeId or any PII, so this doesn't widen what's exposed.
let where: any;

if (user) {
  const ownershipClauses: any[] = [];
  if (user.id && !user.isGuest) {
    ownershipClauses.push({ attendeeData: { path: ['userId'], equals: user.id } });
  }
  if (user.phoneNumber) {
    const phoneVariants = buildPhoneVariants(user.phoneNumber);
    if (phoneVariants.length > 0) {
      ownershipClauses.push({
        OR: phoneVariants.map((phone) => ({
          attendeeData: { path: ['phoneNumber'], equals: phone },
        })),
      });
    }
  }

  if (ownershipClauses.length === 0) {
    return NextResponse.json({ error: 'Could not verify ownership of the transaction.' }, { status: 403 });
  }

  where = {
    AND: [
      { OR: [{ transactionId }, { arifpaySessionId: transactionId }] },
      { OR: ownershipClauses },
    ],
  };
} else {
  where = {
    OR: [{ transactionId }, { arifpaySessionId: transactionId }],
  };
}

const order = await prisma.pendingOrder.findFirst({
  where,
  select: {
    status: true,
    transactionId: true,
    // ✅ DO NOT expose attendeeId here. We will retrieve it on the final, authenticated page if needed.
    // The client only needs the transactionId for the redirect.
  },
});

    if (order) {
      // ✅ Return only safe, non-internal data.
      return NextResponse.json({
        status: order.status,
        transactionId: order.transactionId,
      });
    }

    // If no order is found for this user, it's a 404.
    return NextResponse.json({ status: 'NOT_FOUND' }, { status: 404 });

  } catch (error) {
    console.error(`Failed to get payment status for ${transactionId}:`, error);
    return NextResponse.json(
      {
        error: 'Failed to fetch payment status',
        detail:
          'An unexpected error occurred while checking the payment status.',
      },
      { status: 500 }
    );
  }
}

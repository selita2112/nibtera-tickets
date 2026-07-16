
'use server';

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizeEthiopianPhoneStrict, normalizePhoneNumber } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    console.error("Callback Error: Invalid JSON in request body.", e);
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const headerList = await headers();
  const authHeader = headerList.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error("Authorization header is missing or malformed.");
    return NextResponse.json({ message: 'Authorization header is required.' }, { status: 401 });
  }

  const tokenFromHeader = authHeader.substring(7);

  const {
    paidAmount,
    txnRef,
    transactionId,
    token: tokenFromBody,
  } = requestBody;

  if (tokenFromHeader !== tokenFromBody) {
    console.error("Token mismatch between header and body.");
    return NextResponse.json({ message: "Token validation failed." }, { status: 401 });
  }

  try {
    const eventPayment = await prisma.eventPayment.findFirst({
      where: { transactionId: txnRef },
      include: { pendingOrder: true }
    });

    if (!eventPayment || !eventPayment.pendingOrder) {
      console.error(`Order not found for NIB transaction reference: ${txnRef}`);
      return NextResponse.json({ message: 'Order not found, but acknowledged.' }, { status: 200 });
    }

    if (eventPayment.status === 'COMPLETED' || eventPayment.pendingOrder.status === 'COMPLETED') {
      console.log(`Order for transaction ${txnRef} already handled.`);
      return NextResponse.json({ message: 'Already handled' }, { status: 200 });
    }

    // Use a transaction to ensure atomicity
    const createdAttendee = await prisma.$transaction(async (tx) => {
      // 1. Get attendee data from pending order
      const attendeeData = eventPayment.pendingOrder.attendeeData as { name: string, phoneNumber?: string, userId?: string, tickets: any[] };
      const { name, phoneNumber, userId, tickets } = attendeeData;
      // Phone numbers should already be normalized at order creation time.
      // Keep a safe fallback for legacy rows to avoid storing malformed data.
      const normalizedPhone = phoneNumber
        ? (() => {
            try {
              return normalizeEthiopianPhoneStrict(phoneNumber);
            } catch {
              const maybe = normalizePhoneNumber(phoneNumber);
              return maybe ? normalizeEthiopianPhoneStrict(maybe) : null;
            }
          })()
        : null;

      if (!tickets || tickets.length === 0) {
        throw new Error('No ticket information found in pending order.');
      }
      
      // 2. Validate and normalize userId
      // Guest users have userId like "guest_phonenumber" which is not a valid foreign key
      // Only use userId if it's a real user ID that exists in the User table
      let validUserId: string | null = null;
      if (userId && !userId.startsWith('guest_')) {
        // Check if the user exists in the database
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user) {
          validUserId = userId;
        } else {
          console.warn(`User with ID ${userId} not found in database. Setting userId to null.`);
        }
      }
      // If userId starts with 'guest_' or is invalid, validUserId remains null
      
      let lastAttendee = null;

      // 3. Create Attendee record(s)
      for (const ticketInfo of tickets) {
        const ticketTypeId = ticketInfo.id;
        const quantity = ticketInfo.quantity || 1;

        const ticketType = await tx.ticketType.findUnique({ where: { id: ticketTypeId } });
        if (!ticketType) {
          throw new Error(`Ticket type with ID ${ticketTypeId} not found.`);
        }
        if ((ticketType.total - ticketType.sold) < quantity) {
          throw new Error(`Not enough tickets available for "${ticketType.name}".`);
        }

        const attendeesToCreate = Array.from({ length: quantity }).map(() => ({
          name,
          phoneNumber: normalizedPhone || undefined,
          userId: validUserId, // Use validated userId (null for guests)
          eventId: eventPayment.eventId,
          ticketTypeId: ticketTypeId,
          checkedIn: false,
          qrCode: randomUUID(), // Generate a unique QR code
        }));

        await tx.attendee.createMany({ data: attendeesToCreate });

        // Get the last created attendee for this batch
        lastAttendee = await tx.attendee.findFirst({
            where: { 
              eventId: eventPayment.eventId, 
              name, 
              phoneNumber: normalizedPhone || undefined, 
              userId: validUserId, 
              ticketTypeId: ticketTypeId 
            },
            orderBy: { createdAt: 'desc' }
        });

        // 3. Update ticket stock
        await tx.ticketType.update({
          where: { id: ticketTypeId },
          data: { sold: { increment: quantity } },
        });
      }
      
      // 4. Update Promo Code uses if applicable
      if (eventPayment.pendingOrder.promoCode) {
        const promo = await tx.promoCode.findFirst({ where: { code: eventPayment.pendingOrder.promoCode, eventId: eventPayment.eventId } });
        if (promo) {
          const totalQuantity = tickets.reduce((sum, t) => sum + (t.quantity || 1), 0);
          await tx.promoCode.update({
            where: { id: promo.id },
            data: { uses: { increment: totalQuantity } },
          });
        }
      }

      // 5. Update PendingOrder status and link to the created attendee
      await tx.pendingOrder.update({
        where: { id: eventPayment.pendingOrderId },
        data: { status: 'COMPLETED', attendeeId: lastAttendee?.id },
      });

      // 6. Update EventPayment status
      await tx.eventPayment.update({
        where: { id: eventPayment.id },
        data: {
          status: 'COMPLETED',
          amount: paidAmount,
          paymentDate: new Date(),
          reference: transactionId, // NIB's own transactionId
        },
      });
      
      return lastAttendee;
    });

    // Revalidate paths to show updated data
    revalidatePath(`/events/${eventPayment.eventId}`);
    revalidatePath('/');
    revalidatePath('/tickets');
    revalidatePath(`/payment/success?transaction_id=${eventPayment.pendingOrder.transactionId}`);

    console.log(`Successfully processed payment for transaction ${txnRef}.`);
    

    return NextResponse.json({ message: 'Payment confirmed and updated.', attendeeId: createdAttendee?.id }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ message: 'Internal server error processing webhook.', detail: error.message }, { status: 500 });
  }
}

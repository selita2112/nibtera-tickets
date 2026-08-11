'use server';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { normalizeEthiopianPhoneStrict, normalizePhoneNumber } from '@/lib/utils';
import {
  buildApiIntegrationPayload,
  encryptApiIntegrationPayload,
  decryptApiIntegrationResponse,
} from '@/lib/services/yagoutPayService';

/**
 * "API Integration" (doc section B) charge endpoint.
 *
 * Unlike /api/payment/yagout/initiate (Aggregator Hosted — full-page redirect
 * to Yagout's checkout page, result delivered later via /yagoutPay-callback),
 * this route stays entirely server-to-server: we POST the encrypted JSON
 * request, Yagout pushes an authorization prompt to the customer's wallet,
 * and the Successful/Failed result comes back synchronously in THIS same
 * HTTP response. There is no success_url/failure_url and no separate
 * callback route for this flow — the ticket is issued (or the payment
 * marked failed) before we return.
 */
export async function POST(req: NextRequest) {
  let eventPaymentId: string | null = null;

  try {
    // --- 1. Parse & validate request body ---
    const body = await req.json();
    const { total, transactionId: pendingOrderTransactionId, walletType, mobileNumber } = body;

    const numericTotal = typeof total === 'string' ? Number(total) : total;
    if (!pendingOrderTransactionId || numericTotal == null || Number.isNaN(numericTotal)) {
      return NextResponse.json({ error: 'Total amount and transaction ID are required.' }, { status: 400 });
    }
    if (Number(numericTotal) === 0) {
      return NextResponse.json({ error: 'Free ticket orders do not require payment initiation.' }, { status: 400 });
    }
    if (!walletType || typeof walletType !== 'string') {
      return NextResponse.json({ error: 'Please select a wallet to pay with.' }, { status: 400 });
    }
    const cleanedMobile = String(mobileNumber ?? '').replace(/\D/g, '');
    if (!cleanedMobile) {
      return NextResponse.json({ error: 'A mobile number is required for wallet payment.' }, { status: 400 });
    }

    // --- 2. Load the pending order this payment is for ---
    const pendingOrder = await prisma.pendingOrder.findUnique({
      where: { transactionId: pendingOrderTransactionId },
      include: { event: true },
    });
    if (!pendingOrder) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (pendingOrder.status === 'COMPLETED') {
      return NextResponse.json({ error: 'This order has already been paid.' }, { status: 400 });
    }

    const existingAttempts = await prisma.eventPayment.count({
      where: { pendingOrderId: pendingOrder.id, method: 'YAGOUTPAY_API' },
    });
    if (existingAttempts >= 5) {
      console.warn('[YAGOUT CHARGE] Too many payment attempts for order.', {
        transactionId: pendingOrder.transactionId,
        existingAttempts,
      });
      return NextResponse.json(
        { error: 'Too many payment attempts for this order. Please contact support.' },
        { status: 429 },
      );
    }

    const attendeeData = pendingOrder.attendeeData as {
      name: string;
      phoneNumber?: string;
      userId?: string;
      tickets: { id: number; quantity: number }[];
    };

    // --- 3. Env / config ---
    const meId = process.env.YAGOUTPAY_MERCHANT_ID;
    const aggregatorId = process.env.YAGOUTPAY_AGGREGATOR_ID ?? 'yagout';
    const apiUrl = process.env.YAGOUTPAY_API_URL;
    const pgId = process.env.YAGOUTPAY_PG_ID;
    const schemeId = process.env.YAGOUTPAY_SCHEME_ID;

    if (!meId || !apiUrl || !pgId || !schemeId) {
      console.error('[YAGOUT CHARGE] Missing YagoutPay API-integration environment variables.');
      return NextResponse.json({ error: 'Payment service is not configured correctly.' }, { status: 500 });
    }

    // --- 4. Build a payment-specific order number and persist an EventPayment row ---
    const orderNo = 'TCK_' + randomBytes(4).toString('hex');
    const amount = Number(numericTotal).toFixed(2);

    const eventPayment = await prisma.eventPayment.create({
      data: {
        eventId: pendingOrder.eventId,
        pendingOrderId: pendingOrder.id,
        amount,
        method: 'YAGOUTPAY_API',
        status: 'PENDING',
        transactionId: orderNo,
      },
    });
    eventPaymentId = eventPayment.id;

    // --- 5. Build & encrypt the API-integration JSON payload ---
    const payload = buildApiIntegrationPayload({
      agId: aggregatorId,
      meId,
      orderNo,
      amount,
      country: 'ETH',
      currency: 'ETB',
      walletType,
      mobileNumber: cleanedMobile,
      customerName: attendeeData.name,
      isLoggedIn: attendeeData.userId ? 'Y' : 'N',
      pgId,
      schemeId,
    });
    const merchantRequest = encryptApiIntegrationPayload(payload);

    console.log('================ [YAGOUT CHARGE] Outgoing API request ================');
    console.log('[YAGOUT CHARGE] apiUrl:', apiUrl);
    console.log('[YAGOUT CHARGE] me_id:', meId, 'orderNo:', orderNo, 'amount:', amount, 'wallet:', walletType);
    console.log('=======================================================================');

    // --- 6. Call Yagout synchronously. This blocks while the customer
    //     approves the wallet prompt on their phone, so we give it a
    //     generous timeout (per Yagout's own sample, ~2 minutes). ---
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110_000);

    let apiJson: { merchantId?: string; status?: string; statusMessage?: string; response?: string };
    try {
      const apiResp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: meId, merchantRequest }),
        signal: controller.signal,
      });
      apiJson = await apiResp.json();
    } catch (err: any) {
      console.error('[YAGOUT CHARGE] Network/timeout error calling YagoutPay API.', err?.message || err);
      await prisma.eventPayment.update({ where: { id: eventPayment.id }, data: { status: 'FAILED' } });
      const timedOut = err?.name === 'AbortError';
      return NextResponse.json(
        { success: false, error: timedOut ? 'The wallet did not respond in time. Please try again.' : 'Could not reach the payment service.' },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    console.log('[YAGOUT CHARGE] Raw API response:', JSON.stringify(apiJson));

    if (!apiJson?.response) {
      // Top-level failure (e.g. bad encryption, malformed request) — no txn to decrypt.
      await prisma.eventPayment.update({ where: { id: eventPayment.id }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { success: false, error: apiJson?.statusMessage || 'Payment request was rejected.' },
        { status: 400 },
      );
    }

    const decrypted = decryptApiIntegrationResponse(apiJson.response);
    const txn = decrypted.txn_response;
    console.log('[YAGOUT CHARGE] Decrypted txn_response:', JSON.stringify(txn));

    const isSuccess = txn?.status?.toLowerCase() === 'successful';
    const reference = txn?.pg_ref || txn?.ag_ref || null;

    // Sanity-check the amount Yagout confirms against what we asked for.
    if (isSuccess && txn && Number(txn.amount).toFixed(2) !== amount) {
      console.error('[YAGOUT CHARGE] Amount mismatch.', { expected: amount, received: txn.amount, orderNo });
      await prisma.eventPayment.update({ where: { id: eventPayment.id }, data: { status: 'FAILED', reference } });
      return NextResponse.json({ success: false, error: 'Payment verification failed.' }, { status: 400 });
    }

    if (!isSuccess) {
      await prisma.eventPayment.update({ where: { id: eventPayment.id }, data: { status: 'FAILED', reference } });
      return NextResponse.json(
        { success: false, error: txn?.res_message || 'Payment was not approved. Please try again.' },
        { status: 200 },
      );
    }

    // --- 7. Success — issue the ticket(s), same logic as /yagoutPay-callback ---
    const createdAttendee = await prisma.$transaction(async (tx) => {
      const { name, phoneNumber, userId, tickets } = attendeeData;

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

      let validUserId: string | null = null;
      if (userId && !userId.startsWith('guest_')) {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user) validUserId = userId;
      }

      let lastAttendee = null;

      for (const ticketInfo of tickets) {
        const ticketTypeId = ticketInfo.id;
        const quantity = ticketInfo.quantity || 1;

        const ticketType = await tx.ticketType.findUnique({ where: { id: ticketTypeId } });
        if (!ticketType) throw new Error(`Ticket type with ID ${ticketTypeId} not found.`);
        if (ticketType.total - ticketType.sold < quantity) {
          throw new Error(`Not enough tickets available for "${ticketType.name}".`);
        }

        const attendeesToCreate = Array.from({ length: quantity }).map(() => ({
          name,
          phoneNumber: normalizedPhone || undefined,
          userId: validUserId,
          eventId: pendingOrder.eventId,
          ticketTypeId,
          checkedIn: false,
          qrCode: randomUUID(),
        }));

        await tx.attendee.createMany({ data: attendeesToCreate });

        lastAttendee = await tx.attendee.findFirst({
          where: {
            eventId: pendingOrder.eventId,
            name,
            phoneNumber: normalizedPhone || undefined,
            userId: validUserId,
            ticketTypeId,
          },
          orderBy: { createdAt: 'desc' },
        });

        await tx.ticketType.update({ where: { id: ticketTypeId }, data: { sold: { increment: quantity } } });
      }

      if (pendingOrder.promoCode) {
        const promo = await tx.promoCode.findFirst({ where: { code: pendingOrder.promoCode, eventId: pendingOrder.eventId } });
        if (promo) {
          const totalQuantity = tickets.reduce((sum, t) => sum + (t.quantity || 1), 0);
          await tx.promoCode.update({ where: { id: promo.id }, data: { uses: { increment: totalQuantity } } });
        }
      }

      await tx.pendingOrder.update({
        where: { id: pendingOrder.id },
        data: { status: 'COMPLETED', attendeeId: lastAttendee?.id },
      });

      await tx.eventPayment.update({
        where: { id: eventPayment.id },
        data: {
          status: 'COMPLETED',
          amount: txn!.amount,
          paymentDate: new Date(),
          reference,
        },
      });

      return lastAttendee;
    });

    revalidatePath(`/events/${pendingOrder.eventId}`);
    revalidatePath('/');
    revalidatePath('/tickets');

    console.log(`[YAGOUT CHARGE] Payment confirmed for order ${pendingOrder.transactionId}, attendee ${createdAttendee?.id}.`);

    return NextResponse.json({ success: true, attendeeId: createdAttendee?.id });
  } catch (err: any) {
    console.error('[YAGOUT CHARGE] Unexpected error:', err);
    if (eventPaymentId) {
      await prisma.eventPayment.update({ where: { id: eventPaymentId }, data: { status: 'FAILED' } }).catch(() => {});
    }
    return NextResponse.json({ success: false, error: err.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}
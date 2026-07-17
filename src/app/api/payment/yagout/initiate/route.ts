'use server';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import prisma from '@/lib/prisma';

import {
  yagoutEncrypt,
  yagoutHash,
  buildMerchantRequestPlaintext,
} from '@/lib/services/yagoutPayService';

export async function POST(req: NextRequest) {
  try {
    // --- 1. Auth (mirrors the existing NIB Mini-App initiate route) ---
    

    // --- 2. Parse request body ---
    const body = await req.json();
    const { total, transactionId: pendingOrderTransactionId } = body;

    const numericTotal = typeof total === 'string' ? Number(total) : total;
    if (!pendingOrderTransactionId || numericTotal == null || Number.isNaN(numericTotal)) {
      return NextResponse.json(
        { error: 'Total amount and transaction ID are required.' },
        { status: 400 },
      );
    }
    if (Number(numericTotal) === 0) {
      return NextResponse.json(
        { error: 'Free ticket orders do not require payment initiation.' },
        { status: 400 },
      );
    }

    // --- 3. Load the pending order this payment is for ---
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

    const attendeeData = pendingOrder.attendeeData as {
      name: string;
      phoneNumber?: string;
      userId?: string;
    };

    // --- 4. Env / config ---
    const meId = process.env.YAGOUTPAY_MERCHANT_ID;
    const aggregatorId = process.env.YAGOUTPAY_AGGREGATOR_ID ?? 'yagout';
    const postUrl = process.env.YAGOUTPAY_POST_URL;
    const callbackUrl = process.env.YAGOUTPAY_CALLBACK_URL; // e.g. https://tickets.nibbank.com.et/api/payment/yagoutPay-callback

    if (!meId || !postUrl || !callbackUrl) {
      console.error('[YAGOUT INITIATE] Missing YagoutPay environment variables.');
      return NextResponse.json({ error: 'Payment service is not configured correctly.' }, { status: 500 });
    }

    // --- 5. Build a payment-specific order number and persist an EventPayment row ---
    const orderNo = 'TCK_' + randomBytes(4).toString('hex');
    const amount = Number(numericTotal).toFixed(2);

    await prisma.eventPayment.create({
      data: {
        eventId: pendingOrder.eventId,
        pendingOrderId: pendingOrder.id,
        amount,
        method: 'YAGOUTPAY',
        status: 'PENDING',
        transactionId: orderNo, // Yagout's order_no doubles as our EventPayment key
      },
    });

    // --- 6. Build & encrypt the merchant_request, and the integrity hash ---
    const plaintext = buildMerchantRequestPlaintext({
      txn: {
        agId: aggregatorId,
        meId,
        orderNo,
        amount,
        country: 'ETH',
        currency: 'ETB',
        txnType: 'SALE',
        successUrl: callbackUrl,
        failureUrl: callbackUrl,
        channel: 'WEB',
      },
      cust: {
        custName: attendeeData.name,
        emailId: '', // eticket attendees aren't required to supply email
        mobileNo: (attendeeData.phoneNumber ?? '').replace(/\D/g, ''),
        isLoggedIn: attendeeData.userId ? 'Y' : 'N',
      },
      // Carry the PendingOrder's own transactionId through the round trip so the
      // callback can find/complete the correct order (same trick as udf1=billId in Building).
      udf1: pendingOrder.transactionId,
    });

    const merchantRequest = yagoutEncrypt(plaintext);
      const hashInputRaw = `${meId}~${orderNo}~${amount}~ETH~ETB`;
    const hash = yagoutHash({ merchantId: meId, orderNo, amount, country: 'ETH', currency: 'ETB' });
 console.log('================ [YAGOUT INITIATE] Outgoing request ================');
    console.log('[YAGOUT INITIATE] postUrl:', postUrl);
    console.log('[YAGOUT INITIATE] me_id:', meId);
    console.log('[YAGOUT INITIATE] orderNo:', orderNo);
    console.log('[YAGOUT INITIATE] amount:', amount);
    console.log('[YAGOUT INITIATE] plaintext merchant_request (pre-encryption):', plaintext);
    console.log('[YAGOUT INITIATE] encrypted merchant_request:', merchantRequest);
    console.log('[YAGOUT INITIATE] hash input string (before sha256+encrypt):', hashInputRaw);
    console.log('[YAGOUT INITIATE] final hash sent:', hash);
    console.log('======================================================================');
    return NextResponse.json({
      success: true,
      postUrl,
      meId,
      merchantRequest,
      hash,
    });
  } catch (err: any) {
    console.error('[YAGOUT INITIATE] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}

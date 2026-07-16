
'use server';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { format } from 'date-fns';
import { cookies } from 'next/headers';


import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    // --- 1. Parse request body ---
    const body = await req.json();
    console.log('[NIB INITIATE] Received body:', body);

    const { total, transactionId: pendingOrderTransactionId } = body;

    const numericTotal = typeof total === 'string' ? Number(total) : total;
    if (pendingOrderTransactionId == null || pendingOrderTransactionId === '' || numericTotal == null || Number.isNaN(numericTotal)) {
      return NextResponse.json(
        { error: 'Total amount and transaction ID are required.' },
        { status: 400 }
      );
    }

    // Free tickets should never require payment initiation.
    if (Number(numericTotal) === 0) {
      return NextResponse.json(
        { error: 'Free ticket orders do not require payment initiation.' },
        { status: 400 }
      );
    }

    // --- 2. Get SuperApp User Token from the new 'superapp_token' cookie ---
    const cookieStore = await cookies();
    const superAppToken = cookieStore.get('superapp_token')?.value;

console.log({superAppToken});

    if (!superAppToken) {
        console.error('[NIB INITIATE] Error: SuperApp authorization token (superapp_token) not found in cookie.');
        return NextResponse.json({ error: 'User session not found. Please log in through the SuperApp.' }, { status: 401 });
    }
    console.log('[NIB INITIATE] Using SuperApp user token from cookie.');


    // --- 3. Fetch pending order and event ---
    const pendingOrder = await prisma.pendingOrder.findUnique({
      where: { transactionId: pendingOrderTransactionId },
      include: { event: true }
    });

    if (!pendingOrder || !pendingOrder.event?.nibBankAccount) {
      return NextResponse.json(
        { error: 'Missing event or bank account information for this order.' },
        { status: 404 }
      );
    }

    const ACCOUNT_NO = pendingOrder.event.nibBankAccount;
    console.log('[NIB INITIATE] Account No:', ACCOUNT_NO);

    const COMPANY_NAME = process.env.NIB_COMPANY_NAME;
    const NIB_PAYMENT_KEY = process.env.NIB_PAYMENT_KEY;
    const NIB_PAYMENT_URL = process.env.NIB_PAYMENT_URL;
    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

    if (!COMPANY_NAME || !NIB_PAYMENT_KEY || !NIB_PAYMENT_URL || !APP_URL) {
      console.error('[NIB INITIATE] Error: Server is missing required NIB environment variables.');
      return NextResponse.json({ error: 'Payment service is not configured correctly.' }, { status: 500 });
    }

    // --- 4. Generate transaction info & build signature ---
    const transactionId = crypto.randomUUID();
    const transactionTime = format(new Date(), 'yyyyMMddHHmmss');
    const callBackURL = process.env.NIB_CALLBACK;

    const signatureString = [
      `accountNo=${ACCOUNT_NO}`,
      `amount=${total}`,
      `callBackURL=${callBackURL}`,
      `companyName=${COMPANY_NAME}`,
      `Key=${NIB_PAYMENT_KEY}`,
      `token=${superAppToken}`, // Use the SuperApp user token for the signature
      `transactionId=${transactionId}`,
      `transactionTime=${transactionTime}`,
    ].join('&');

console.log({signatureString});

    const signature = crypto.createHash('sha256').update(signatureString, 'utf8').digest('hex');

    const payload = {
      accountNo: ACCOUNT_NO,
      amount: String(total),
      callBackURL: callBackURL,
      companyName: COMPANY_NAME,
      token: superAppToken, // The user's token goes in the payload
      transactionId,
      transactionTime,
      signature,
    };

console.log({payload});

    // --- 5. Create EventPayment record ---
    const eventPayment = await prisma.eventPayment.create({
      data: {
        amount: total,
        method: 'GATEWAY',
        status: 'PENDING',
        transactionId, // Our internal reference for the payment attempt
        pendingOrderId: pendingOrder.id,
        eventId: pendingOrder.eventId,
      },
    });
    console.log('[NIB INITIATE] EventPayment record created:', eventPayment.id);

    // --- 6. Call NIB Payment API ---
    console.log('[NIB INITIATE] Calling NIB Payment API...');
    console.log(superAppToken);
    let responseData: any;

    try {
     const response = await fetch(NIB_PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${superAppToken}`
      },
      body: JSON.stringify(payload),
    });





console.log({payload,superAppToken, NIB_PAYMENT_URL});

      console.log('[NIB INITIATE] Payment API Status:', response.status);
      const responseText = await response.text();
      console.log('[NIB INITIATE] NIB Payment raw response:', responseText);

      if (!response.ok) {
        return NextResponse.json({ error: 'NIB payment request failed', details: responseText }, { status: response.status });
      }

       if (!responseText) {
        return NextResponse.json({ error: 'NIB payment response was empty.' }, { status: 502 });
      }

      responseData = JSON.parse(responseText);
      if (!responseData.token) {
        return NextResponse.json({ error: 'NIB payment response invalid, missing payment token', raw: responseText }, { status: 502 });
      }
    } catch (err: any) {
      console.error('[NIB INITIATE] Payment request to NIB failed:', err);
      return NextResponse.json({ error: 'Could not connect to NIB payment service.', details: err.message }, { status: 503 });
    }

    // --- 7. Save sessionId (the paymentToken from NIB) ---
    await prisma.eventPayment.update({
      where: { transactionId: eventPayment.transactionId },
      data: { sessionId: responseData.token },
    });

    console.log('[NIB INITIATE] Payment token from NIB saved successfully.');

    return NextResponse.json({
      success: true,
      paymentToken: responseData.token,
    });

  } catch (err: any) {
    console.error('[NIB INITIATE] Unexpected top-level error:', err);
    return NextResponse.json({ error: err.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}

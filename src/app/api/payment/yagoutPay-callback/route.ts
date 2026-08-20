'use server';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { normalizeEthiopianPhoneStrict, normalizePhoneNumber } from '@/lib/utils';
import {
  safeDecrypt,
  verifyYagoutHash,
  parseTxnResponse,
} from '@/lib/services/yagoutPayService';
import { logAudit } from '@/lib/audit';
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error('YagoutPay callback: failed to parse form body.', e);
    return redirectTo(request, 'failure', null, 'invalid_request');
  }

  const txnResponseEnc = formData.get('txn_response')?.toString();
  const otherDetailsEnc = formData.get('other_details')?.toString();
  const hashEnc = formData.get('hash')?.toString();
// --- Log every callback field Yagout actually posted, raw + decrypted ---
  const meIdField = formData.get('me_id')?.toString();
  const pgDetailsEnc = formData.get('pg_details')?.toString();
  const txnDetailsEnc = formData.get('txn_details')?.toString();
  const fraudDetailsEnc = formData.get('fraud_details')?.toString();

  console.log('================ [YAGOUT CALLBACK] Raw fields received ================');
  console.log('[YAGOUT CALLBACK] me_id (plain):', meIdField);
  console.log('[YAGOUT CALLBACK] txn_response (encrypted):', txnResponseEnc);
  console.log('[YAGOUT CALLBACK] pg_details (encrypted):', pgDetailsEnc);
  console.log('[YAGOUT CALLBACK] txn_details (encrypted):', txnDetailsEnc);
  console.log('[YAGOUT CALLBACK] other_details (encrypted):', otherDetailsEnc);
  console.log('[YAGOUT CALLBACK] fraud_details (encrypted):', fraudDetailsEnc);
  console.log('[YAGOUT CALLBACK] hash (encrypted):', hashEnc);

  console.log('[YAGOUT CALLBACK] pg_details (decrypted):', pgDetailsEnc ? safeDecrypt(pgDetailsEnc) : null);
  console.log('[YAGOUT CALLBACK] txn_details (decrypted):', txnDetailsEnc ? safeDecrypt(txnDetailsEnc) : null);
  console.log('[YAGOUT CALLBACK] fraud_details (decrypted):', fraudDetailsEnc ? safeDecrypt(fraudDetailsEnc) : null);
  console.log('==========================================================================');
  if (!txnResponseEnc) {
    console.error('YagoutPay callback: missing txn_response.');
    return redirectTo(request, 'failure', null, 'missing_fields');
  }

  // 1. Decrypt the transaction response
const decryptedTxn = safeDecrypt(txnResponseEnc);
  if (!decryptedTxn) {
    console.error('YagoutPay callback: failed to decrypt txn_response.');
    return redirectTo(request, 'failure', null, 'decrypt_failed');
  }
  const txn = parseTxnResponse(decryptedTxn);

  console.log('[YAGOUT CALLBACK] raw hash field:', hashEnc);
  console.log('[YAGOUT CALLBACK] decrypted txn_response:', decryptedTxn);
  console.log('[YAGOUT CALLBACK] parsed txn:', JSON.stringify(txn));

  // 2. Recover our PendingOrder's transactionId from udf_1 (other_details)
  let pendingOrderTxnId: string | null = null;
  if (otherDetailsEnc) {
    const decryptedOther = safeDecrypt(otherDetailsEnc);
    if (decryptedOther) {
      pendingOrderTxnId = decryptedOther.split('|')[0] || null;
    }
  }

  // 3. Verify the integrity hash before trusting anything in the payload
  if (hashEnc) {
    const hashValid = verifyYagoutHash(hashEnc, {
      merchantId: txn.meId,
      orderNo: txn.orderNo,
      amount: txn.amount,
      country: txn.country,
      currency: txn.currency,
    });
    console.log('[YAGOUT CALLBACK] hash valid?', hashValid);
    if (!hashValid) {
      console.error('YagoutPay callback: hash verification failed.', { orderNo: txn.orderNo });
      return redirectTo(request, 'failure', pendingOrderTxnId, 'signature_invalid');
    }
  }
else {
    console.warn('YagoutPay callback: no hash field present — signature verification skipped.', { orderNo: txn.orderNo });
  }

  // 3b. Compensating control while hash verification is unreliable: confirm
  // the callback actually claims to be for OUR merchant account.
  if (txn.meId !== process.env.YAGOUTPAY_MERCHANT_ID) {
    console.error('YagoutPay callback: merchant ID mismatch.', { received: txn.meId, expected: process.env.YAGOUTPAY_MERCHANT_ID, orderNo: txn.orderNo });
    return redirectTo(request, 'failure', pendingOrderTxnId, 'merchant_mismatch');
  }
  // 4. Look up our EventPayment (by Yagout order_no) and the PendingOrder it belongs to
  const eventPayment = await prisma.eventPayment.findUnique({
    where: { transactionId: txn.orderNo },
    include: { pendingOrder: true },
  });

  if (!eventPayment || !eventPayment.pendingOrder) {
    console.error('YagoutPay callback: no matching EventPayment found.', { orderNo: txn.orderNo });
    return redirectTo(request, 'failure', pendingOrderTxnId, 'order_not_found');
  }

  const pendingOrder = eventPayment.pendingOrder;
  const isSuccess = txn.status?.toLowerCase() === 'successful';
   const attendeeDataForLog = pendingOrder.attendeeData as { tickets?: { id: number; quantity: number }[] } | null;
  let ticketTypeNamesForLog: string[] = [];
  if (attendeeDataForLog?.tickets?.length) {
    const ticketTypesForLog = await prisma.ticketType.findMany({
      where: { id: { in: attendeeDataForLog.tickets.map(t => t.id) } },
      select: { name: true },
    });
    ticketTypeNamesForLog = ticketTypesForLog.map(t => t.name);
  }
  const orderAmountForLog = Number(eventPayment.amount);
  const expectedAmount = Number(eventPayment.amount).toFixed(2);
const receivedAmount = Number(txn.amount).toFixed(2);
if (expectedAmount !== receivedAmount) {
  console.error('YagoutPay callback: amount mismatch.', { expected: expectedAmount, received: receivedAmount, orderNo: txn.orderNo });
  await prisma.eventPayment.update({
    where: { id: eventPayment.id },
    data: { status: 'FAILED', reference: txn.pgRef || txn.agRef || null },
  });
    await logAudit({
    action: 'PAYMENT_FAILED',
    entityType: 'EventPayment',
    entityId: eventPayment.id,
    details: {
      orderNo: txn.orderNo,
      reason: 'amount_mismatch',
      expectedAmount,
      receivedAmount,
      amount: orderAmountForLog,
      ticketType: ticketTypeNamesForLog.join(', '),
    },
    status: 'FAILURE',
  });
  return redirectTo(request, 'failure', pendingOrder.transactionId, 'amount_mismatch');
}

  // 5. Idempotency guard — Yagout may redeliver the callback
  if (eventPayment.status === 'COMPLETED' || pendingOrder.status === 'COMPLETED') {
    return redirectTo(request, 'success', pendingOrder.transactionId, null);
  }

  if (!isSuccess) {
    await prisma.eventPayment.update({
      where: { id: eventPayment.id },
      data: { status: 'FAILED', reference: txn.pgRef || txn.agRef || null },
    });
         await logAudit({
      action: 'PAYMENT_FAILED',
      entityType: 'EventPayment',
      entityId: eventPayment.id,
      details: {
        orderNo: txn.orderNo,
        reason: txn.resMessage || 'payment_failed',
        amount: orderAmountForLog,
        ticketType: ticketTypeNamesForLog.join(', '),
      },
      status: 'FAILURE',
    });
    return redirectTo(request, 'failure', pendingOrder.transactionId, txn.resMessage || 'payment_failed');
  }

  // 6. Success — issue the ticket(s), same logic as the existing NIB webhook handler
  try {
    const createdAttendee = await prisma.$transaction(async (tx) => {
      const attendeeData = pendingOrder.attendeeData as {
        name: string;
        phoneNumber?: string;
        userId?: string;
        tickets: { id: number; quantity: number }[];
      };
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
      const purchasedTicketTypeNames: string[] = [];
      for (const ticketInfo of tickets) {
        const ticketTypeId = ticketInfo.id;
        const quantity = ticketInfo.quantity || 1;

        const ticketType = await tx.ticketType.findUnique({ where: { id: ticketTypeId } });
        if (!ticketType) throw new Error(`Ticket type with ID ${ticketTypeId} not found.`);
        if (ticketType.total - ticketType.sold < quantity) {
          throw new Error(`Not enough tickets available for "${ticketType.name}".`);
        }
        purchasedTicketTypeNames.push(ticketType.name);
        const attendeesToCreate = Array.from({ length: quantity }).map(() => ({
          name,
          phoneNumber: normalizedPhone || undefined,
          userId: validUserId,
          eventId: eventPayment.eventId,
          ticketTypeId,
          checkedIn: false,
          qrCode: randomUUID(),
        }));

        await tx.attendee.createMany({ data: attendeesToCreate });

        lastAttendee = await tx.attendee.findFirst({
          where: {
            eventId: eventPayment.eventId,
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
        const promo = await tx.promoCode.findFirst({ where: { code: pendingOrder.promoCode, eventId: eventPayment.eventId } });
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
          amount: txn.amount,
          paymentDate: new Date(),
          reference: txn.pgRef || txn.agRef || null,
        },
      });

          return { attendee: lastAttendee, ticketTypeNames: purchasedTicketTypeNames };
    });

    revalidatePath(`/events/${eventPayment.eventId}`);
    revalidatePath('/');
    revalidatePath('/tickets');
    revalidatePath(`/payment/success?transaction_id=${pendingOrder.transactionId}`);

    console.log(`YagoutPay: payment confirmed for order ${pendingOrder.transactionId}, attendee ${ createdAttendee?.attendee?.id}.`);
      await logAudit({
      action: 'PAYMENT_COMPLETE',
      entityType: 'EventPayment',
      entityId: eventPayment.id,
      details: {
        orderNo: txn.orderNo,
        eventId: eventPayment.eventId,
        amount: Number(txn.amount),
        attendeeId:  createdAttendee?.attendee?.id,
        ticketType: createdAttendee?.ticketTypeNames?.join(', '),
      },
      status: 'SUCCESS',
    });
    return redirectTo(request, 'success', pendingOrder.transactionId, null);
  } catch (error: any) {
    console.error('YagoutPay callback: failed to finalize order.', error);
    await prisma.eventPayment.update({
      where: { id: eventPayment.id },
      data: { status: 'FAILED', reference: txn.pgRef || txn.agRef || null },
    }).catch(() => {});
         await logAudit({
      action: 'PAYMENT_FAILED',
      entityType: 'EventPayment',
      entityId: eventPayment.id,
      details: {
        orderNo: txn.orderNo,
        reason: 'ticket_issuance_failed',
        error: String(error?.message ?? error),
        amount: orderAmountForLog,
        ticketType: ticketTypeNamesForLog.join(', '),
      },
      status: 'FAILURE',
    });
    return redirectTo(request, 'failure', pendingOrder.transactionId, 'ticket_issuance_failed');
  }
}

function redirectTo(
  request: NextRequest,
  outcome: 'success' | 'failure',
  transactionId: string | null,
  reason: string | null,
) {
  const path = outcome === 'success' ? '/payment/success' : '/payment/failure';
  const url = new URL(path, request.url);
  if (transactionId) url.searchParams.set('transaction_id', transactionId);
  if (reason) url.searchParams.set('reason', reason);
  // Yagout posts the browser here directly, so a 303 turns their POST into a GET on redirect.
  return NextResponse.redirect(url, { status: 303 });
}

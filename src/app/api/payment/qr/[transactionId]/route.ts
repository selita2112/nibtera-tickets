'use server';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await context.params;

  if (!transactionId) {
    return NextResponse.json(
      { error: 'Transaction ID is required.' },
      { status: 400 }
    );
  }

  try {
    const order = await prisma.pendingOrder.findUnique({
      where: { transactionId },
      include: {
        attendee: {
          include: {
            event: true,
            ticketType: true,
          },
        },
      },
    });

    if (!order || order.status !== 'COMPLETED' || !order.attendee) {
      return NextResponse.json(
        { error: 'Completed order with attendee not found.' },
        { status: 404 }
      );
    }

    const attendee = order.attendee;

    return NextResponse.json({
      attendee: {
        id: attendee.id,
        name: attendee.name,
        phoneNumber: attendee.phoneNumber,
      },
      event: {
        id: attendee.event.id,
        name: attendee.event.name,
        startDate: attendee.event.startDate,
        endDate: attendee.event.endDate,
        location: attendee.event.location,
      },
      ticketType: {
        id: attendee.ticketType.id,
        name: attendee.ticketType.name,
      },
      qrCode: attendee.qrCode,
    });
  } catch (error: any) {
    console.error(
      `[QR PAYMENT ENDPOINT] Failed to fetch QR data for transaction ${transactionId}:`,
      error
    );
    return NextResponse.json(
      {
        error: 'Failed to fetch QR code data',
        detail: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}



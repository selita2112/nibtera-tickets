

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { normalizeEthiopianPhoneStrict } from '@/lib/utils';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { eventId, tickets, promoCode, attendeeDetails } = body;

        if (!eventId || !tickets?.length || !attendeeDetails) {
            return NextResponse.json({
                error: 'Invalid request payload',
                detail: 'Required fields: eventId, tickets[], attendeeDetails.'
            }, { status: 400 });
        }

        const totalQuantity = (tickets as Array<{ quantity: number }>).reduce((sum: number, t) => sum + Number(t.quantity), 0);
        const eventRecord = await prisma.event.findUnique({
          where: { id: eventId },
          select: { id: true, startDate: true, endDate: true, status: true },
        });
        if (!eventRecord || eventRecord.status !== 'APPROVED') {
          return NextResponse.json({ error: 'Event unavailable' }, { status: 404 });
        }
        const eventEndTime = eventRecord.endDate ? new Date(eventRecord.endDate) : new Date(eventRecord.startDate);
        if (eventEndTime.getTime() < Date.now()) {
          return NextResponse.json(
            { error: 'Ticket sales closed', detail: 'This event has already ended.' },
            { status: 400 }
          );
        }
        
        // This transactionId is our internal reference for the entire purchase flow.
        const transactionId = randomUUID();

        let normalizedPhone: string;
        try {
            normalizedPhone = normalizeEthiopianPhoneStrict(attendeeDetails.phone);
        } catch (e: any) {
            return NextResponse.json(
                { error: e?.message || 'Invalid phone number.' },
                { status: 400 }
            );
        }

        // Free-ticket limit enforcement (server-side):
        // Free limits are stored in `ticketType.locationPrices` JSON (to avoid schema migrations).
        const primaryTicketTypeId = tickets[0].id;
        const primaryTicketType = await prisma.ticketType.findUnique({
          where: { id: primaryTicketTypeId },
          select: { basePrice: true, name: true, locationPrices: true, eventId: true },
        } as any);
        if (!primaryTicketType || (primaryTicketType as any).eventId !== eventId) {
          return NextResponse.json(
            { error: 'Invalid ticket selection', detail: 'Ticket type does not belong to this event.' },
            { status: 400 }
          );
        }

        const getMaxTicketsPerPhoneFromTicketType = (tt: any): number | null => {
          if (!tt) return null;
          const locationFromName = typeof tt.name === 'string' ? tt.name.split(' - ').slice(1).join(' - ') : null;

          const lp = tt.locationPrices ?? tt.locationConfigs ?? [];
          const entries: any[] = Array.isArray(lp) ? lp : [];
          const normalizedLocation = locationFromName ? String(locationFromName).trim() : null;
          const matched = normalizedLocation
            ? entries.find(e => (e?.location ? String(e.location).trim() : null) === normalizedLocation)
            : entries[0];
          const max = matched?.maxTicketsPerPhone ?? matched?.maxFreeTicketsPerPhone;
          return typeof max === 'number' ? max : null;
        };

        const max = getMaxTicketsPerPhoneFromTicketType(primaryTicketType as any);
        if (typeof max === 'number' && max > 0) {
          const alreadyClaimed = await prisma.attendee.count({
            where: { phoneNumber: normalizedPhone, eventId },
          });
          if (alreadyClaimed + totalQuantity > max) {
            return NextResponse.json(
              {
                success: false,
                error: `Ticket limit exceeded for this user`,
              },
              { status: 400 }
            );
          }
        }

        const pendingOrder = await prisma.pendingOrder.create({
            data: {
                transactionId: transactionId,
                eventId,
                ticketTypeId: tickets[0].id, // Store primary ticket type
                attendeeData: {
                    name: attendeeDetails.name,
                    phoneNumber: normalizedPhone,
                    userId: attendeeDetails.userId,
                    quantity: totalQuantity,
                    tickets: tickets, // Store all selected ticket details
                },
                promoCode,
                status: 'PENDING',
                arifpaySessionId: transactionId, // Use this field to store our internal transaction ID
            },
        });

        return NextResponse.json({ success: true, transactionId: pendingOrder.transactionId });
    } catch (error: any) {
        console.error(`Pending order creation failed:`, error.message);
        return NextResponse.json({
            error: 'Unexpected server error',
            detail: `An unknown error occurred while creating the pending order.`
        }, { status: 500 });
    }
}

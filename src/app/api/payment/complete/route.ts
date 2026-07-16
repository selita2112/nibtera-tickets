
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { id } = body as { id?: string };
        if (!id) {
            return NextResponse.json({
                error: 'Invalid request',
                detail: 'Body must include the transaction ID as "id".'
            }, { status: 400 });
        }

        const order = await prisma.pendingOrder.findFirst({
            where: {
                transactionId: id
            },
            include: {
                event: {
                    select: {
                        startDate: true,
                        endDate: true,
                        status: true,
                    },
                },
            },
        });

        if (!order) {
            return NextResponse.json({
                error: 'Order not found',
                detail: 'No pending order matches the provided transaction/session ID.'
            }, { status: 404 });
        }

        if (order.status === 'COMPLETED') {
            return NextResponse.json(
              { message: 'Already completed', attendeeId: order.attendeeId ?? null },
              { status: 200 }
            );
        }
        const eventEndTime = order.event.endDate ? new Date(order.event.endDate) : new Date(order.event.startDate);
        if (order.event.status !== 'APPROVED' || eventEndTime.getTime() < Date.now()) {
            return NextResponse.json(
              { error: 'Ticket sales closed', detail: 'This event is no longer available for purchase.' },
              { status: 400 }
            );
        }

        // Simulate success by calling the notify logic via DB operations
        const { name, phoneNumber, userId, quantity } = order.attendeeData as { name: string, phoneNumber?: string, userId?: string, quantity: number };

        const createdAttendee = await prisma.$transaction(async (tx) => {
            if (!order.ticketTypeId) {
                throw new Error('Missing ticketTypeId');
            }
            const ticketType = await tx.ticketType.findUnique({ where: { id: order.ticketTypeId } });
            if (!ticketType) {
                throw new Error('Ticket type not found');
            }
            const qty = quantity || 1;

            // Per-user limit enforcement during completion (race-condition safe).
            {
                const locationFromName =
                  typeof (ticketType as any).name === 'string'
                    ? String((ticketType as any).name).split(' - ').slice(1).join(' - ')
                    : null;

                const lp = (ticketType as any).locationPrices ?? (ticketType as any).locationConfigs ?? [];
                const entries: any[] = Array.isArray(lp) ? lp : [];
                const normalizedLocation = locationFromName ? String(locationFromName).trim() : null;
                const matched = normalizedLocation
                  ? entries.find(e => (e?.location ? String(e.location).trim() : null) === normalizedLocation)
                  : entries[0];
                const max = matched?.maxTicketsPerPhone ?? matched?.maxFreeTicketsPerPhone as number | null | undefined;
                if (typeof max === 'number' && max > 0) {
                    if (!phoneNumber) {
                        throw new Error('Permission denied.');
                    }
                    const alreadyClaimed = await tx.attendee.count({
                        where: {
                            phoneNumber: phoneNumber,
                            eventId: order.eventId,
                        },
                    });
                    if (alreadyClaimed + qty > max) {
                        throw new Error('Ticket limit exceeded for this user');
                    }
                }
            }

            const attendees = Array.from({ length: qty }).map(() => ({
                name,
                phoneNumber,
                eventId: order.eventId,
                ticketTypeId: ticketType.id,
                userId,
                checkedIn: false,
                qrCode: randomUUID(),
            }));
            await tx.attendee.createMany({ data: attendees });
            await tx.ticketType.update({ where: { id: ticketType.id }, data: { sold: { increment: qty } } });
            const last = await tx.attendee.findFirst({
                where: { eventId: order.eventId, name, phoneNumber, userId },
                orderBy: { createdAt: 'desc' }
            });
            if (order.promoCode) {
                const promo = await tx.promoCode.findFirst({ where: { code: order.promoCode, eventId: order.eventId } });
                if (promo) {
                    await tx.promoCode.update({ where: { id: promo.id }, data: { uses: { increment: qty } } });
                }
            }
            await tx.pendingOrder.update({ where: { id: order.id }, data: { status: 'COMPLETED', attendeeId: last?.id } });
            return last;
        });

        revalidatePath(`/events/${order.eventId}`);
        revalidatePath('/');
        revalidatePath('/tickets');

        return NextResponse.json({ message: 'Completed', attendeeId: createdAttendee?.id });
    } catch (e: any) {
        console.error('Complete payment error', e);
        const message = e?.message || 'An error occurred while issuing ticket(s) and finalizing the order.';
        const status = String(message).includes('maximum number of free tickets') ? 400 : 500;
        return NextResponse.json(
          {
            error: 'Failed to complete order',
            detail: message,
          },
          { status }
        );
    }
}

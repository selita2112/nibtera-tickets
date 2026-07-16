
'use server';

import { revalidatePath } from 'next/cache';
import prisma from './prisma';
import type { Role, User, TicketType, PromoCode, Event, EventStatus, UserStatus, District, Branch } from '@prisma/client';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import type { DateRange } from 'react-day-picker';
import { randomUUID } from 'crypto';
import { buildPhoneVariants, normalizeEthiopianPhoneStrict, normalizePhoneNumber } from './utils';
import { nanoid } from 'nanoid';
import { sendTempPassword, sendPendingEventNotification } from '@/lib/email';
import cuid from 'cuid';
import bcrypt from 'bcryptjs';
import { hasPermission, validatePermissions } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET;

// Helper to ensure data is serializable
const serialize = (data: any) => {
    if (!data) return null;
    return JSON.parse(JSON.stringify(data, (key, value) =>
        typeof value === 'bigint'
            ? value.toString()
            : value
    ));
}

export async function getCurrentUser(): Promise<(User & { role: Role; branch: Branch | null }) | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    return null;
  }

  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tokenVersion?: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        branch: true,
      },
    });

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return null;
    }

    const permissions = user.role.rolePermissions.map(rp => rp.permission.name);

    const { password: _password, ...userWithoutPassword } = user;

    return serialize({
      ...userWithoutPassword,
      role: {
        ...user.role,
        permissions,
      },
    });
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}

async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required.');
  }
  return user as User & { role: Role & { permissions: string[] }; branch: Branch | null };
}

async function requirePermission(permission: string) {
  const user = await requireAuthenticatedUser();
  if (!hasPermission(user.role, permission)) {
    throw new Error('Permission denied.');
  }
  return user;
}

async function requireAdmin() {
  const user = await requireAuthenticatedUser();
  if (user.role.name !== 'Admin') {
    throw new Error('Permission denied.');
  }
  return user;
}

/**
 * Predefined Access Control Policy for Role Assignment.
 * Defines which requester roles are authorized to assign which target roles.
 */
const ROLE_ASSIGNMENT_POLICY: Record<string, string[]> = {
  'Admin': ['Admin', 'Organizer', 'Staff', 'Sub-admin'],
  'Organizer': ['Staff'],
};

/**
 * Validates if a requester is authorized to assign a specific role to a target user.
 * Implements strict server-side RBAC enforcement for privilege modification.
 */
async function validateRoleAssignment(
  requester: User & { role: Role & { permissions: string[] } },
  targetUserId: string | undefined, // undefined if creating a new user
  newRoleId: string | undefined
) {
  if (!newRoleId) return;

  // 1. Verify that the sensitive roleId field is valid and exists in the database.
  // We do not trust the client-supplied ID without server-side verification.
  const targetRole = await prisma.role.findUnique({
    where: { id: newRoleId },
    select: { name: true }
  });

  if (!targetRole) {
    throw new Error('Invalid roleId: The specified role does not exist.');
  }

  const requesterRoleName = requester.role.name;
  const allowedRoles = ROLE_ASSIGNMENT_POLICY[requesterRoleName] || [];

  // 2. Enforce RBAC: Check if the requester's role is authorized to assign the target role.
  if (!allowedRoles.includes(targetRole.name)) {
    throw new Error(`Permission denied: ${requesterRoleName}s are not authorized to assign the ${targetRole.name} role.`);
  }

  // 3. Strict Authorization Rule: Even authorized users (Admins) have restrictions.
  // To prevent privilege escalation attacks, an Admin can only assign the Admin role to themselves.
  // This prevents an attacker who compromised one Admin account from creating more Admins.
  if (targetRole.name === 'Admin' && requester.id !== targetUserId) {
    throw new Error('Permission denied: The Admin role can only be assigned to yourself by an existing administrator.');
  }
}


// Event Actions
export async function getEvents(status?: EventStatus | 'all') {
    const user = await getCurrentUser();
    if (!user) {
        return [];
    }

    const isAdmin = user.role.name === 'Admin';
    let whereClause: any = {};

    if (status && status !== 'all') {
        whereClause.status = status;
    }

    if (!isAdmin) {
        whereClause.organizerId = user.id;
    }
    
    const events = await prisma.event.findMany({
        where: whereClause,
        include: {
          organizer: isAdmin ? {
            select: {
              firstName: true,
              lastName: true,
            },
          } : undefined,
        },
        orderBy: { startDate: 'asc' },
    });

    return serialize(events);
}


export async function getPublicEvents(): Promise<(Event & { ticketTypes: TicketType[] })[]> {
    const now = new Date();

    const events = await prisma.event.findMany({
        where: {
            status: 'APPROVED',
            OR: [
                {
                    endDate: {
                        gte: now,
                    },
                },
                {
                    endDate: null,
                    startDate: {
                        gte: now,
                    },
                },
            ],
        },
        include: { ticketTypes: true },
        orderBy: { startDate: 'asc' },
    });
    return serialize(events);
}

// --- Homepage carousel ads (admin-managed; not tied to events) ---

export async function getPublicHomeCarouselAds() {
    const ads = await prisma.homeCarouselAd.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
    });
    return serialize(ads) as Array<{
        id: number;
        imageUrl: string;
        title: string | null;
        caption: string | null;
        linkUrl: string | null;
        sortOrder: number;
        isActive: boolean;
    }>;
}

export async function getHomeCarouselAdsAdmin() {
    await requireAdmin();
    const ads = await prisma.homeCarouselAd.findMany({
        orderBy: { sortOrder: 'asc' },
    });
    return serialize(ads);
}

export async function createHomeCarouselAd(data: {
    imageUrl: string;
    title?: string | null;
    caption?: string | null;
    linkUrl?: string | null;
    sortOrder?: number;
    isActive?: boolean;
}) {
    await requireAdmin();
    if (!data.imageUrl || typeof data.imageUrl !== 'string' || !data.imageUrl.trim()) {
        throw new Error('Image is required.');
    }
    const maxRow = await prisma.homeCarouselAd.aggregate({
        _max: { sortOrder: true },
    });
    const nextOrder =
        typeof data.sortOrder === 'number' && !Number.isNaN(data.sortOrder)
            ? data.sortOrder
            : (maxRow._max.sortOrder ?? -1) + 1;

    const ad = await prisma.homeCarouselAd.create({
        data: {
            imageUrl: data.imageUrl.trim(),
            title: data.title?.trim() ? data.title.trim() : null,
            caption: data.caption?.trim() ? data.caption.trim() : null,
            linkUrl: data.linkUrl?.trim() ? data.linkUrl.trim() : null,
            sortOrder: nextOrder,
            isActive: data.isActive !== false,
        },
    });
    revalidatePath('/');
    revalidatePath('/dashboard/settings/homeads');
    return serialize(ad);
}

export async function updateHomeCarouselAd(
    id: number,
    data: {
        imageUrl?: string;
        title?: string | null;
        caption?: string | null;
        linkUrl?: string | null;
        sortOrder?: number;
        isActive?: boolean;
    }
) {
    await requireAdmin();
    const payload: any = {};
    if (data.imageUrl !== undefined) {
        if (!data.imageUrl || !String(data.imageUrl).trim()) {
            throw new Error('Image URL cannot be empty.');
        }
        payload.imageUrl = String(data.imageUrl).trim();
    }
    if (data.title !== undefined) payload.title = data.title?.trim() ? data.title.trim() : null;
    if (data.caption !== undefined) payload.caption = data.caption?.trim() ? data.caption.trim() : null;
    if (data.linkUrl !== undefined) payload.linkUrl = data.linkUrl?.trim() ? data.linkUrl.trim() : null;
    if (data.sortOrder !== undefined && typeof data.sortOrder === 'number') {
        payload.sortOrder = data.sortOrder;
    }
    if (data.isActive !== undefined) payload.isActive = data.isActive;

    const ad = await prisma.homeCarouselAd.update({
        where: { id },
        data: payload,
    });
    revalidatePath('/');
    revalidatePath('/dashboard/settings/home-ads');
    return serialize(ad);
}

export async function deleteHomeCarouselAd(id: number) {
    await requireAdmin();
    await prisma.homeCarouselAd.delete({
        where: { id },
    });
    revalidatePath('/');
    revalidatePath('/dashboard/settings/home-ads');
    return { ok: true };
}


export async function getEventById(id: number) {
    const event = await prisma.event.findUnique({
        where: { id },
        include: {
            ticketTypes: true,
            organizer: {
                select: {
                    firstName: true,
                    lastName: true,
                },
            },
        },
    });

    if (event) {
        const serializedEvent = serialize(event) as any;
         // Manually construct the organizer name from the fetched fields
        if (serializedEvent.organizer) {
            serializedEvent.organizerName = `${''}${serializedEvent.organizer.firstName || ''} ${''}${serializedEvent.organizer.lastName || ''}`.trim();
        }

        serializedEvent.ticketTypes = serializedEvent.ticketTypes.map((tt: any) => {
            // Preserve raw location configuration array/object (may include max tickets per phone)
            const rawLp = tt.locationPrices;
            const entries: any[] = Array.isArray(rawLp) ? rawLp : (rawLp && typeof rawLp === 'object' ? rawLp : []);

            // Also keep a normalized price map for compatibility with existing client code
            if (tt.locationPrices && typeof tt.locationPrices === 'object') {
                 const normalizedPrices: Record<string, number> = {};
                 for (const [loc, price] of Object.entries(tt.locationPrices)) {
                     if (price !== null && price !== undefined) {
                         normalizedPrices[loc] = parseFloat(price as string);
                     }
                 }
                 tt.locationPrices = normalizedPrices;
            } else {
                 tt.locationPrices = {};
            }

            tt.locationConfigs = entries; // new: preserve full config entries (may include maxTicketsPerPhone)
            tt.basePrice = parseFloat(tt.basePrice as any);
            return tt;
        });
        return serializedEvent;
    }

    return null;
}

export async function getEventForTransaction(transactionId: string) {
    const order = await prisma.pendingOrder.findFirst({
        where: {
            OR: [
                { transactionId: transactionId },
                { arifpaySessionId: transactionId }
            ]
        },
        select: { eventId: true }
    });
    return order?.eventId ?? null;
}

export async function getEventDetails(id: number) {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error('User is not authenticated.');
    }
    
    const event = await prisma.event.findUnique({
        where: { id },
        include: {
            ticketTypes: true,
            attendees: {
                include: {
                    ticketType: true,
                }
            },
            promoCodes: true,
        }
    });

    if (!event) return null;

    if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
        throw new Error("You are not authorized to view this event's details.");
    }

    return serialize(event);
}

export async function addEvent(data: any) {
    const { tickets, startDate, endDate, otherCategory, locations, images, ...eventData } = data;
    const user = await requirePermission('Events:Create');

    let nibBankAccount = user.nibBankAccount;

    if (user.role.name === 'Admin' && !nibBankAccount) {
        const defaultAdmin = await prisma.user.findFirst({
            where: { role: { name: 'Admin' } },
            orderBy: { createdAt: 'asc' },
        });
        
        if (defaultAdmin?.nibBankAccount) {
            nibBankAccount = defaultAdmin.nibBankAccount;
        } else {
            console.warn("Admin event creation: Default admin has no NIB account. Event will be created without a bank account, but this may cause payout issues.");
        }
    }
    
    const finalCategory = eventData.category === 'Other' ? otherCategory : eventData.category;
    
    const locationString = locations.map((l: { value: string }) => l.value).join('||');
    
    // Store multiple event images in the existing `image` column.
    // We use JSON so `data:image/...` URIs (which contain commas) are not corrupted.
    const imageString = Array.isArray(images) && images.length > 0 ? JSON.stringify(images) : null;

    const newEvent = await prisma.event.create({
        data: {
            ...eventData,
            image: imageString,
            location: locationString,
            organizerId: user.id,
            nibBankAccount: nibBankAccount,
            category: finalCategory,
            startDate: startDate,
            endDate: endDate,
            status: user.role.name === 'Admin' ? 'APPROVED' : 'PENDING',
            rejectionReason: null,
        },
    });

    // Notify Admin(s) if event is PENDING approval
    if (newEvent.status === 'PENDING') {
        try {
            const admins = await prisma.user.findMany({
                where: {
                    role: { name: 'Admin' },
                    AND: [{ email: { not: null } }, { email: { not: '' } }],
                },
                select: { email: true }
            });

            if (admins.length > 0) {
                const organizerName = `${user.firstName} ${user.lastName}`;
                const eventDateFormatted = new Date(startDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                });

                // Send email to all configured admins
                await Promise.all(admins.map(admin => 
                    sendPendingEventNotification({
                        adminEmail: admin.email!,
                        eventName: newEvent.name,
                        organizerName: organizerName,
                        eventDate: eventDateFormatted,
                        eventId: newEvent.id
                    })
                ));
            }
        } catch (emailError) {
            console.error('Failed to notify admins about new pending event:', emailError);
        }
    }

    if (tickets && tickets.length > 0) {
      for (const ticket of tickets) {
        if (ticket.locationPrices && ticket.locationPrices.length > 0) {
            for (const config of ticket.locationPrices) {
                if (config.location && config.price >= 0 && config.quantity >= 0) {
                     await prisma.ticketType.create({
                        data: {
                            name: `${ticket.name} - ${config.location}`,
                            description: ticket.description,
                            basePrice: config.price,
                            total: config.quantity,
                            sold: 0,
                            eventId: newEvent.id,
                            locationPrices: ticket.locationPrices,
                        } as any
                    });
                }
            }
        }
      }
    }

    revalidatePath('/dashboard/events');
    revalidatePath('/dashboard');
    revalidatePath('/');
    return serialize(newEvent);
}

export async function updateEvent(id: number, data: any) {
    const { startDate, endDate, otherCategory, locations, images, tickets, ...eventData } = data;
    const user = await requirePermission('Events:Update');

    const eventToUpdate = await prisma.event.findUnique({ where: { id }});
    if (!eventToUpdate) throw new Error("Event not found");

    const isOwner = eventToUpdate.organizerId === user.id;
    const isAdmin = user.role.name === 'Admin';

    if (!isOwner && !isAdmin) {
        throw new Error("You are not authorized to update this event.");
    }
    
    const finalCategory = eventData.category === 'Other' ? otherCategory : eventData.category;
    const locationString = locations.map((l: { value: string }) => l.value).join('||');
    // Store multiple event images in the existing `image` column.
    // We use JSON so `data:image/...` URIs (which contain commas) are not corrupted.
    const imageString = Array.isArray(images) && images.length > 0 ? JSON.stringify(images) : null;

    const updatedEvent = await prisma.event.update({
        where: { id },
        data: {
            ...eventData,
            image: imageString,
            location: locationString,
            category: finalCategory,
            startDate: startDate,
            endDate: endDate,
            status: isAdmin ? eventToUpdate.status : 'PENDING',
        }
    });

    // Notify Admin(s) if event is PENDING approval after update
    if (updatedEvent.status === 'PENDING' && !isAdmin) {
        try {
            const admins = await prisma.user.findMany({
                where: {
                    role: { name: 'Admin' },
                    AND: [{ email: { not: null } }, { email: { not: '' } }],
                },
                select: { email: true }
            });

            if (admins.length > 0) {
                const organizerName = `${user.firstName} ${user.lastName}`;
                const eventDateFormatted = new Date(startDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                });

                // Send email to all configured admins
                await Promise.all(admins.map(admin => 
                    sendPendingEventNotification({
                        adminEmail: admin.email!,
                        eventName: updatedEvent.name,
                        organizerName: organizerName,
                        eventDate: eventDateFormatted,
                        eventId: updatedEvent.id
                    })
                ));
            }
        } catch (emailError) {
            console.error('Failed to notify admins about updated pending event:', emailError);
        }
    }

    revalidatePath('/dashboard/events');
    revalidatePath(`/dashboard/events/${id}`);
    revalidatePath(`/dashboard/events/${id}/edit`);
    revalidatePath(`/events/${id}`);
    revalidatePath('/');

    return serialize(updatedEvent);
}

export async function updateEventStatus(id: number, status: EventStatus, rejectionReason?: string) {
    const user = await requireAuthenticatedUser();
    if (user.role.name !== 'Admin') {
      throw new Error('Permission denied.');
    }
    
    const eventToUpdate = await prisma.event.findUnique({ where: { id }});
    if (!eventToUpdate) throw new Error("Event not found");

    const updatedEvent = await prisma.event.update({
        where: { id },
        data: {
            status: status,
            rejectionReason: status === 'REJECTED' ? rejectionReason : null,
        }
    });

    revalidatePath('/dashboard/events');
    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/events/${id}`);
    revalidatePath('/');
    return serialize(updatedEvent);
}

export async function deleteEvent(id: number) {
  const user = await requirePermission('Events:Delete');

  const eventToDelete = await prisma.event.findUnique({ where: { id }});
  if (!eventToDelete) throw new Error("Event not found");

  const isOwner = eventToDelete.organizerId === user.id;
  const isAdmin = user.role.name === 'Admin';

  if (!isOwner && !isAdmin) {
      throw new Error("You are not authorized to delete this event.");
  }

  await prisma.$transaction([
    prisma.attendee.deleteMany({ where: { eventId: id } }),
    prisma.promoCode.deleteMany({ where: { eventId: id } }),
    prisma.ticketType.deleteMany({ where: { eventId: id } }),
    prisma.eventPayment.deleteMany({ where: { eventId: id } }),
    prisma.pendingOrder.deleteMany({ where: { eventId: id } }),
    prisma.event.delete({ where: { id } }),
  ]);
  
  revalidatePath('/dashboard/events');
  revalidatePath('/');
}


export async function addTicketType(
  eventId: number,
  data: {
    name: string;
    description?: string;
    locationPrices: { location: string; price: number; quantity: number; maxFreeTicketsPerPhone?: number }[];
  }
) {
    const user = await requirePermission('Events:Update');
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');
    if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
      throw new Error('Permission denied.');
    }

    for (const config of data.locationPrices) {
        if (config.location && config.price >= 0 && config.quantity >= 0) {
            await prisma.ticketType.create({
                data: {
                    name: `${data.name} - ${config.location}`,
                    description: data.description,
                    basePrice: config.price,
                    total: config.quantity,
                    sold: 0,
                    eventId: eventId,
                    locationPrices: data.locationPrices,
                } as any
            });
        }
    }
    revalidatePath(`/dashboard/events/${eventId}`);
}

export async function updateTicketType(ticketTypeId: number, data: any) {
  const user = await requirePermission('Events:Update');
  const ticketType = await prisma.ticketType.findUnique({
    where: { id: ticketTypeId },
    select: { eventId: true, locationPrices: true, name: true },
  });
  if (!ticketType) throw new Error('Ticket type not found');
  const event = await prisma.event.findUnique({ where: { id: ticketType.eventId }, select: { organizerId: true } });
  if (!event) throw new Error('Event not found');
  if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
    throw new Error('Permission denied.');
  }

  const parsedLocationFromName =
    typeof data.name === 'string' ? data.name.split(' - ').slice(1).join(' - ') : null;
  const newLocation =
    typeof data.location === 'string'
      ? data.location
      : parsedLocationFromName;
  const currentLocationPrices: any = ticketType.locationPrices;
  const entries: any[] = Array.isArray(currentLocationPrices) ? currentLocationPrices : [];
  const normalizedNewLocation =
    typeof newLocation === 'string' ? newLocation.trim() : null;

  const nextLocationPrices = entries.length
    ? entries.map((entry) => {
        const entryLocation =
          typeof entry?.location === 'string' ? entry.location.trim() : null;
        if (!normalizedNewLocation || entryLocation !== normalizedNewLocation) return entry;
        return {
          ...entry,
          location: entry?.location ?? normalizedNewLocation,
          price: data.price,
          quantity: data.total,
          free: Number(data.price) === 0,
          maxFreeTicketsPerPhone:
            Number(data.price) === 0
              ? data.maxFreeTicketsPerPhone ?? entry?.maxFreeTicketsPerPhone ?? entry?.maxTicketsPerPhone ?? null
              : null,
          // Keep legacy key in sync so enforcement doesn't continue using the old value.
          maxTicketsPerPhone:
            Number(data.price) === 0
              ? data.maxFreeTicketsPerPhone ?? entry?.maxTicketsPerPhone ?? entry?.maxFreeTicketsPerPhone ?? null
              : null,
        };
      })
    : currentLocationPrices;

  const updatedTicketType = await prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: {
        name: data.name,
        description: data.description,
        basePrice: data.price,
        total: data.total,
        locationPrices: nextLocationPrices,
    } as any,
  });
  revalidatePath(`/dashboard/events/${updatedTicketType.eventId}`);
  return serialize(updatedTicketType);
}

export async function deleteTicketType(ticketTypeId: number) {
  const user = await requirePermission('Events:Update');
  const ticketType = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
  if (!ticketType) throw new Error('Ticket type not found');
  const event = await prisma.event.findUnique({ where: { id: ticketType.eventId }, select: { organizerId: true } });
  if (!event) throw new Error('Event not found');
  if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
    throw new Error('Permission denied.');
  }

  const attendeeCount = await prisma.attendee.count({ where: { ticketTypeId: ticketTypeId } });
  if (attendeeCount > 0) {
    throw new Error(`Cannot delete ticket type, ${attendeeCount} tickets have already been sold.`);
  }

  await prisma.ticketType.delete({ where: { id: ticketTypeId } });
  revalidatePath(`/dashboard/events/${ticketType.eventId}`);
}


export async function addPromoCode(eventId: number, data: any, allTicketTypes?: TicketType[]) {
    const user = await requirePermission('Events:Update');

    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) throw new Error('Event not found.');
    if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
        throw new Error('Permission denied.');
    }

    let finalCode = data.code;
    if (data.restrictionType === 'TICKET' && data.ticketTypeId && allTicketTypes) {
        const ticketType = allTicketTypes.find(t => t.id === parseInt(data.ticketTypeId, 10));
        if (ticketType) {
            finalCode = `TICKET:${ticketType.name}:${data.code}`;
        }
    } else if (data.restrictionType === 'LOCATION' && data.location) {
        finalCode = `LOCATION:${data.location}:${data.code}`;
    }

    const newPromoCode = await prisma.promoCode.create({
        data: {
            code: finalCode,
            type: data.type,
            value: data.value,
            maxUses: data.maxUses,
            eventId: eventId,
        }
    });
    revalidatePath(`/dashboard/events/${eventId}`);
    return serialize(newPromoCode);
}

export async function updatePromoCode(promoCodeId: number, data: any, allTicketTypes?: TicketType[]) {
    const user = await requirePermission('Events:Update');

    const existing = await prisma.promoCode.findUnique({ where: { id: promoCodeId }, select: { eventId: true } });
    if (!existing) throw new Error('Promo code not found.');

    const event = await prisma.event.findUnique({ where: { id: existing.eventId }, select: { organizerId: true } });
    if (!event) throw new Error('Associated event not found.');
    if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
        throw new Error('Permission denied.');
    }

    let finalCode = data.code;
    if (data.restrictionType === 'TICKET' && data.ticketTypeId && allTicketTypes) {
        const ticketType = allTicketTypes.find(t => t.id === parseInt(data.ticketTypeId, 10));
        if (ticketType) {
            finalCode = `TICKET:${ticketType.name}:${data.code}`;
        }
    } else if (data.restrictionType === 'LOCATION' && data.location) {
        finalCode = `LOCATION:${data.location}:${data.code}`;
    }

    const updatedPromoCode = await prisma.promoCode.update({
        where: { id: promoCodeId },
        data: {
            code: finalCode,
            type: data.type,
            value: data.value,
            maxUses: data.maxUses,
        },
    });
    revalidatePath(`/dashboard/events/${updatedPromoCode.eventId}`);
    return serialize(updatedPromoCode);
}

export async function deletePromoCode(promoCodeId: number) {
        const user = await requirePermission('Events:Update');

        const promoCode = await prisma.promoCode.findUnique({ where: { id: promoCodeId }, select: { eventId: true, uses: true } });
        if (!promoCode) throw Error('Promo code not found');

        const event = await prisma.event.findUnique({ where: { id: promoCode.eventId }, select: { organizerId: true } });
        if (!event) throw new Error('Associated event not found.');
        if (user.role.name !== 'Admin' && event.organizerId !== user.id) {
                throw new Error('Permission denied.');
        }

        if (promoCode.uses > 0) {
                throw new Error('Cannot delete promo code, it has already been used.');
        }

        await prisma.promoCode.delete({ where: { id: promoCodeId } });
        revalidatePath(`/dashboard/events/${promoCode.eventId}`);
        return { ok: true };
    }

// Dashboard Actions
export async function getDashboardData() {
    const user = await getCurrentUser();
    if (!user) {
         return {
            totalRevenue: 0,
            totalTicketsSold: 0,
            totalEvents: 0,
            pendingEvents: 0,
            salesData: [],
        };
    }

    const isUserAdmin = user.role.name === 'Admin';
    const organizerFilter = isUserAdmin ? {} : { organizerId: user.id };
    
    const totalEvents = await prisma.event.count({ where: organizerFilter });

    const approvedWhereClause = { ...organizerFilter, status: 'APPROVED' as EventStatus };
    
    const approvedEvents = await prisma.event.findMany({
        where: approvedWhereClause,
        include: {
            ticketTypes: true
        }
    });
    
    const pendingEventsFilter = isUserAdmin ? { status: 'PENDING' as EventStatus } : { organizerId: user.id, status: 'PENDING' as EventStatus };
    const pendingEvents = await prisma.event.count({ where: pendingEventsFilter });
    
    const totalRevenue = approvedEvents.reduce((sum, event) => {
        return sum + event.ticketTypes.reduce((eventSum, tt) => {
            const price = tt.basePrice ? Number(tt.basePrice) : 0;
            return eventSum + (tt.sold * price);
        }, 0);
    }, 0);

    const totalTicketsSold = approvedEvents.reduce((sum, event) => {
        return sum + event.ticketTypes.reduce((eventSum, tt) => eventSum + tt.sold, 0)
    }, 0);
    
    const chartData = approvedEvents.map(event => ({
        name: event.name,
        ticketsSold: event.ticketTypes.reduce((sum, t) => sum + t.sold, 0),
    })).filter(e => e.ticketsSold > 0);

    return serialize({
        totalRevenue,
        totalTicketsSold,
        totalEvents,
        pendingEvents,
        salesData: chartData,
    });
}


// Reports Actions
export async function getReportsData(dateRange?: DateRange, eventNameSearch?: string) {
    const user = await getCurrentUser();
    if (!user) {
        return {
            productSales: [],
            dailySales: [],
            promoCodes: [],
            events: [],
        };
    }

    const whereClause: any = { status: 'APPROVED' };

    if (user.role.name !== 'Admin') {
        whereClause.organizerId = user.id;
    }

    if (dateRange?.from) {
        whereClause.startDate = { ...whereClause.startDate, gte: dateRange.from };
    }
    if (dateRange?.to) {
        whereClause.startDate = { ...whereClause.startDate, lte: dateRange.to };
    }

    if (eventNameSearch) {
        whereClause.name = { contains: eventNameSearch, mode: 'insensitive' };
    }
    
    const events = await prisma.event.findMany({
        where: whereClause,
        include: {
            ticketTypes: true,
            promoCodes: true,
        },
        orderBy: { startDate: 'asc' }
    });

    const allEventsForFilter = await prisma.event.findMany({
        where: user.role.name === 'Admin' ? {} : { organizerId: user.id },
        orderBy: { name: 'asc' }
    });

    const ticketTypes = events.flatMap(e => e.ticketTypes.map(tt => ({ ...tt, event: { name: e.name }, basePrice: tt.basePrice })));
    
    const dailySalesData = events.map(event => {
        const revenue = event.ticketTypes.reduce((sum, t) => sum + (t.sold * Number(t.basePrice)), 0);
        return {
            date: event.startDate,
            eventName: event.name,
            ticketsSold: event.ticketTypes.reduce((sum, t) => sum + t.sold, 0),
            revenue
        }
    });

    const promoCodes = events.flatMap(e => e.promoCodes.map(pc => ({ ...pc, event: { name: e.name } })));
    
    const promoCodeData = promoCodes.map(code => {
        const avgTicketPrice = 50;
        let totalDiscount = 0;
        if (code.type === 'PERCENTAGE') {
            totalDiscount = code.uses * (avgTicketPrice * (Number(code.value) / 100));
        } else {
            totalDiscount = code.uses * Number(code.value);
        }
        return {
            ...code,
            totalDiscount,
        };
    });

    return serialize({
        productSales: ticketTypes.map(p => ({...p, price: p.basePrice, revenue: p.sold * Number(p.basePrice)})),
        dailySales: dailySalesData,
        promoCodes: promoCodeData,
        events: allEventsForFilter,
    });
}

// Settings Actions
export async function getUsersAndRoles() {
    await requireAdmin();
    
    const users = await prisma.user.findMany({
      include: { 
          role: true,
          branch: {
              include: {
                  district: true
              }
          }
      },
      orderBy: { createdAt: 'desc'}
    });
    
    const roles = await prisma.role.findMany({
        include: {
            rolePermissions: {
                select: {
                    permission: {
                        select: { name: true }
                    }
                }
            }
        }
    });
    
    const serializedRoles = roles.map(r => ({
        ...r,
        permissions: (r.rolePermissions || []).map(p => p.permission.name)
    }));


    const usersWithoutPasswords = users.map(({ password: _password, ...rest }) => rest);

    return serialize({ users: usersWithoutPasswords, roles: serializedRoles });
}


export async function getUserById(userId: string) {
    await requireAdmin();
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
    });
    if (!user) return null;
    const { password: _password, ...rest } = user;
    return serialize(rest);
}


export async function getUserByPhoneNumber(phoneNumber: string) {
    await requireAdmin();
    let normalizedPhone: string;
    try {
        normalizedPhone = normalizeEthiopianPhoneStrict(phoneNumber);
    } catch (e: any) {
        throw new Error(e?.message || 'Invalid phone number.');
    }
    const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
        include: {
            role: true,
        },
    });
    if (!user) return null;
    const { password: _password, ...rest } = user;
    return serialize(rest);
}

export async function getStaffForUser(organizerId: string | undefined) {
    const requester = await requirePermission('Staff Management:Access');
    if (!organizerId) return [];

    if (requester.role.name !== 'Admin' && organizerId !== requester.id) {
      throw new Error('Permission denied.');
    }
    const staff = await prisma.user.findMany({
        where: {
            organizerId: organizerId,
        },
        include: {
            role: true,
            branch: {
                include: {
                    district: true
                }
            }
        }
    });

    const staffWithoutPasswords = staff.map(({ password: _password, ...rest }) => rest);
    return serialize(staffWithoutPasswords);
}

export async function updateUser(userId: string, data: Partial<User>) {
    const requester = await requireAuthenticatedUser();
    
    // Authorization: Admin can update anyone. Organizer can update their own staff.
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
        throw new Error('User not found.');
    }

    const isAdmin = requester.role.name === 'Admin';
    const isOrganizerOfTarget = targetUser.organizerId === requester.id;

    if (!isAdmin && !isOrganizerOfTarget) {
        throw new Error('Permission denied.');
    }

    const { firstName, lastName, phoneNumber, roleId, nibBankAccount, email, branchId } = data;

    // Prevent privilege escalation: only allow admins to assign the Admin role to themselves.
    await validateRoleAssignment(requester, userId, roleId);

    const normalizedPhoneNumber = typeof phoneNumber === 'string' && phoneNumber.trim().length > 0
      ? normalizeEthiopianPhoneStrict(phoneNumber)
      : undefined;
    let updatedUser;
    try {
        updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                firstName,
                lastName,
                phoneNumber: normalizedPhoneNumber ?? phoneNumber,
                roleId,
                branchId: branchId || null,
                nibBankAccount: nibBankAccount || null,
                email: email || null,
            },
        });
    } catch (err: any) {
        // Handle unique constraint violations for friendlier errors
        if (err?.code === 'P2002') {
            const metaTarget = err?.meta?.target;
            if (Array.isArray(metaTarget) && metaTarget.includes('email')) {
                throw new Error('The provided email address is already in use.');
            }
            if (Array.isArray(metaTarget) && metaTarget.includes('phoneNumber')) {
                throw new Error('The provided phone number is already registered.');
            }
            throw new Error('Unique constraint violation.');
        }
        throw err;
    }

    revalidatePath('/dashboard/settings/users');
    revalidatePath(`/dashboard/settings/users/${userId}/edit`);
    return serialize(updatedUser);
}


export async function updateUserRole(userId: string, newRoleId: string) {
    const requester = await requireAuthenticatedUser();
    
    // Authorization: Admin can update anyone. Organizer can update their own staff.
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
        throw new Error('User not found.');
    }

    const isAdmin = requester.role.name === 'Admin';
    const isOrganizerOfTarget = targetUser.organizerId === requester.id;

    if (!isAdmin && !isOrganizerOfTarget) {
        throw new Error('Permission denied.');
    }

    // Prevent privilege escalation: only allow authorized roles to assign specific roles.
    await validateRoleAssignment(requester, userId, newRoleId);
    const user = await prisma.user.update({
        where: { id: userId },
        data: { roleId: newRoleId },
    });

    // Privilege update: revoke sessions + bump tokenVersion (kills access tokens)
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await prisma.session.updateMany({
      where: { userId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    revalidatePath('/dashboard/settings/users');
    // Ensure global/server components that depend on permissions are refreshed
    revalidatePath('/');
    revalidatePath('/dashboard');
    const { password: _password, ...rest } = user;
    return serialize(rest);
}

export async function updateUserStatus(userId: string, status: UserStatus) {
    const requester = await requireAuthenticatedUser();
    
    // Authorization: Admin can update anyone. Organizer can update their own staff.
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
        throw new Error('User not found.');
    }

    const isAdmin = requester.role.name === 'Admin';
    const isOrganizerOfTarget = targetUser.organizerId === requester.id;

    if (!isAdmin && !isOrganizerOfTarget) {
        throw new Error('Permission denied.');
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: { status },
    });

    // Status change can affect access: revoke sessions + bump tokenVersion
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await prisma.session.updateMany({
      where: { userId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    revalidatePath('/dashboard/settings/users');
    const { password: _password, ...rest } = user;
    return serialize(rest);
}

export async function deleteUser(userId: string, phoneNumber: string) {
  try {
    const currentUser = await requireAuthenticatedUser();

        // Allow self-delete. Admins can delete anyone. Organizers may delete their own staff.
        const isSelfRequest = currentUser.id === userId;

        const userToDelete = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
        if (!userToDelete) {
            return { ok: false, message: 'User not found.' };
        }

        const isAdmin = currentUser.role.name === 'Admin';
        const isOrganizerOfTarget = userToDelete.organizerId === currentUser.id;

        if (!isSelfRequest && !isAdmin && !isOrganizerOfTarget) {
            return { ok: false, message: 'Permission denied.' };
        }

        const count = await prisma.event.count({ where: { organizerId: userId } });

    if (count > 0) {
      return {
        ok: false,
        message: `Cannot delete user. They are the organizer of ${count} event(s). Please delete or reassign the events first.`,
      };
    }
    
    // In a real app with external auth, you'd delete the user there first.
    // For this prototype, we'll just delete from the local DB.
    
    // Also, if this user is an organizer, we might need to delete their staff.
    if (userToDelete?.role?.name === 'Organizer') {
        if (currentUser.role.name !== 'Admin') {
          return { ok: false, message: 'Permission denied.' };
        }
        await prisma.user.deleteMany({
            where: { organizerId: userId }
        });
    }

    await prisma.attendee.deleteMany({ where: { userId }});

    await prisma.user.delete({
      where: { id: userId },
    });
    
    revalidatePath('/dashboard/settings/users');
    
    return { ok: true };
  } catch (err: any) {
    console.error('Error deleting user:', err);

    if (err.code === 'P2003') { 
        return {
            ok: false,
            message: "Cannot delete user. They are still linked to other records in the database (e.g., as an event organizer). Please reassign or delete those records first."
        };
    }

    return {
      ok: false,
      message: err.message ?? "Unexpected server error.",
    };
  }
}



export async function getRoles() {
    try {
        await requireAdmin();
        const roles = await prisma.role.findMany({ include: { rolePermissions: { include: { permission: true } } } });
        // Normalize permissions into an array for easier use on the client
        const normalized = roles.map(r => {
            // Prefer explicit join rows, but fall back to legacy `permissions` column if present.
            let perms: string[] = [];
            if (r.rolePermissions && r.rolePermissions.length > 0) {
                perms = r.rolePermissions.map(rp => rp.permission.name);
            } else if (r.permissions) {
                try {
                    const parsed = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
                    if (Array.isArray(parsed)) perms = parsed;
                } catch (e) {
                    // If parsing fails, try comma-split as a last resort
                    if (typeof r.permissions === 'string') {
                        perms = r.permissions.split(',').map(s => s.trim()).filter(Boolean);
                    }
                }
            }

            return { ...r, permissions: perms };
        });
        return serialize(normalized);
    } catch (error: any) {
        console.error("Failed to fetch roles from database:", error);
        throw new Error("Could not load roles. Please check the database connection and try again.");
    }
}

export async function getRoleById(id: string) {
    await requireAdmin();
    const role = await prisma.role.findUnique({
        where: { id },
        include: { rolePermissions: { include: { permission: true } } },
    });

    if (!role) return null;

    let perms: string[] = [];
    if (role.rolePermissions && role.rolePermissions.length > 0) {
        perms = role.rolePermissions.map(rp => rp.permission.name);
    } else if (role.permissions) {
        try {
            // Ensure permissions is a string before trying to parse
            const permissionsString = Array.isArray(role.permissions)
                ? JSON.stringify(role.permissions)
                : String(role.permissions);

            const parsed = JSON.parse(permissionsString);
            if (Array.isArray(parsed)) {
                perms = parsed.map(String); // Ensure all elements are strings
            }
        } catch (e) {
            console.warn(`Failed to parse permissions for role ${id}:`, role.permissions, e);
            if (typeof role.permissions === 'string') {
                perms = role.permissions.split(',').map(s => s.trim()).filter(Boolean);
            }
        }
    }

    const normalized = { ...role, permissions: perms };
    return serialize(normalized);
}


export async function createRole(data: { name: string; description: string; permissions: string[] }) {
    await requireAdmin();
    const { name, description, permissions } = data;
    // Normalize incoming permissions: enforce string type, trim whitespace, remove empty and duplicates
    const normalizedPermissions = Array.isArray(permissions)
        ? Array.from(new Set(permissions.map(p => String(p ?? '').trim()).filter(Boolean)))
        : [];

    const validation = validatePermissions(normalizedPermissions);
    if (!validation.valid) {
        throw new Error(`Invalid permissions submitted: ${(validation.invalid || []).join(', ')}`);
    }

    const dbPerms = await prisma.permission.findMany({ where: { name: { in: normalizedPermissions } } });
    if (dbPerms.length !== normalizedPermissions.length) {
        const dbPermNames = new Set(dbPerms.map(p => p.name));
        const missingPerms = normalizedPermissions.filter(p => !dbPermNames.has(p));
        throw new Error(`Some submitted permissions do not exist in the database: ${missingPerms.join(', ')}`);
    }

    const role = await prisma.role.create({ data: { name, description } });

    if (dbPerms.length > 0) {
      await prisma.rolePermission.createMany({
        data: dbPerms.map(p => ({ roleId: role.id, permissionId: p.id })),
      });
    }

    revalidatePath('/dashboard/settings/roles');
    revalidatePath('/dashboard/settings/roles/new');
    revalidatePath('/');
    revalidatePath('/dashboard');
    return serialize(role);
}

export async function updateRole(id: string, data: Partial<Role> & { permissions: string | string[] }) {
    await requireAdmin();
    let permissionsArray: string[];
    
    if (typeof data.permissions === 'string') {
        try {
            permissionsArray = JSON.parse(data.permissions);
        } catch (e) {
            throw new Error('Invalid permissions format: expected a JSON string array.');
        }
    } else {
        permissionsArray = data.permissions ?? [];
    }

    permissionsArray = Array.isArray(permissionsArray)
      ? Array.from(new Set(permissionsArray.map(p => String(p ?? '').trim()).filter(Boolean)))
      : [];

    const validation = validatePermissions(permissionsArray);
    if (!validation.valid) {
        throw new Error(`Invalid permissions provided: ${(validation.invalid || []).join(', ')}`);
    }

    const dbPerms = await prisma.permission.findMany({ where: { name: { in: permissionsArray } } });
    if (dbPerms.length !== permissionsArray.length) {
        const dbPermNames = new Set(dbPerms.map(p => p.name));
        const missingPerms = permissionsArray.filter(p => !dbPermNames.has(p));
        throw new Error(`Some submitted permissions do not exist in the database: ${missingPerms.join(', ')}`);
    }

    await prisma.role.update({ where: { id }, data: { name: data.name, description: data.description } });

    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    
    if (dbPerms.length > 0) {
      await prisma.rolePermission.createMany({
        data: dbPerms.map(p => ({ roleId: id, permissionId: p.id })),
      });
    }

    const role = await prisma.role.findUnique({ where: { id }, include: { rolePermissions: { include: { permission: true } } } });
    
    revalidatePath('/dashboard/settings/roles');
    revalidatePath(`/dashboard/settings/roles/${id}/edit`);
    revalidatePath('/');
    revalidatePath('/dashboard');
    
    return serialize(role);
}


export async function deleteRole(id: string) {
    await requireAdmin();
    const usersWithRole = await prisma.user.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
        throw new Error("Cannot delete role. It is assigned to one or more users. Please reassign users before deleting.");
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    const role = await prisma.role.delete({ where: { id } });
    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/settings/roles');
    return serialize(role);
}

export async function updatePasswordFlag(userId: string, passwordChangeRequired: boolean): Promise<void> {
    const current = await requireAuthenticatedUser();
    if (current.id !== userId && current.role.name !== 'Admin') {
        throw new Error('Permission denied.');
    }
    await prisma.user.update({
        where: { id: userId },
        data: { passwordChangeRequired: passwordChangeRequired },
    });
    revalidatePath('/profile');
}


export async function resetUserPassword(userId: string) {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role.name !== 'Admin') {
        throw new Error('You are not authorized to perform this action.');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return { ok: false, message: 'User not found.' };
    }

    // Generate a temporary password
    const tempPassword = nanoid(8);
    const hashed = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
        where: { id: userId },
        data: {
            password: hashed,
            passwordUpdatedAt: new Date(),
            passwordChangeRequired: true,
            tokenVersion: { increment: 1 },
        },
    });

    // Send the temporary password to the user's email (if present)
    try {
        if (user.email) {
            await sendTempPassword({ email: user.email, phoneNumber: user.phoneNumber, tempPassword });
        }
    } catch (err) {
        console.error('Failed to send temporary password email:', err);
        return { ok: false, message: 'Password reset but failed to send email.' };
    }

    revalidatePath('/dashboard/settings/users');
    return { ok: true };
}

export async function resetStaffPassword(userId: string) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error('You are not authorized to perform this action.');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return { ok: false, message: 'User not found.' };
    }

    // Allow if current user is Admin or the organizer who created this staff member
    const isAdmin = currentUser.role?.name === 'Admin';
    const isCreator = user.organizerId && user.organizerId === currentUser.id;
    if (!isAdmin && !isCreator) {
        throw new Error('You are not authorized to perform this action.');
    }

    // Generate a temporary password
    const tempPassword = nanoid(8);
    const hashed = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
        where: { id: userId },
        data: {
            password: hashed,
            passwordUpdatedAt: new Date(),
            passwordChangeRequired: true,
            tokenVersion: { increment: 1 },
        },
    });

    // Send the temporary password to the user's email (if present)
    try {
        if (user.email) {
            await sendTempPassword({ email: user.email, phoneNumber: user.phoneNumber, tempPassword });
        }
    } catch (err) {
        console.error('Failed to send temporary password email:', err);
        return { ok: false, message: 'Password reset but failed to send email.' };
    }

    revalidatePath('/dashboard/settings/staff');
    revalidatePath('/dashboard/settings/users');
    return { ok: true };
}


// Ticket/Attendee Actions
export async function purchaseTickets(request: {
  eventId: number;
  tickets: { id: number; quantity: number, name: string; price: number }[];
  promoCode?: string;
  attendeeDetails: {
    name: string;
    phone: string;
    email?: string;
    userId?: string;
  };
}) {
    const { eventId, tickets, promoCode, attendeeDetails } = request;
    const user = await getCurrentUser();

    if (!user && !attendeeDetails.phone) {
        throw new Error("User must be logged in or provide a phone number.");
    }

    let normalizedPhone: string | null = null;
    if (attendeeDetails.phone) {
        normalizedPhone = normalizeEthiopianPhoneStrict(attendeeDetails.phone);
    }

    const totalRequestedQuantity = tickets.reduce((sum, t) => sum + Number(t.quantity ?? 0), 0);

    return await prisma.$transaction(async (tx) => {
        let totalAmount = 0;
        let discountAmount = 0;
        // Free ticket support:
        // If all selected ticket tiers have base price of 0, skip payment pages and go straight to confirmation.
        let allSelectedFree = true;
        const phoneForLimit = normalizedPhone ?? attendeeDetails.phone;

        for (const ticket of tickets) {
            const ticketType = await tx.ticketType.findUnique({ where: { id: ticket.id } });
            if (!ticketType) throw new Error(`Ticket type with ID ${ticket.id} not found.`);
            if ((ticketType.total - ticketType.sold) < ticket.quantity) {
                throw new Error(`Not enough tickets available for "${ticketType.name}".`);
            }
            totalAmount += Number(ticketType.basePrice) * ticket.quantity;
            allSelectedFree = allSelectedFree && Number(ticketType.basePrice) === 0;

                        // Per-user limit enforcement (supports legacy maxFreeTicketsPerPhone and new maxTicketsPerPhone)
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

                        const max = (matched?.maxTicketsPerPhone ?? matched?.maxFreeTicketsPerPhone) as number | null | undefined;
                        if (typeof max === 'number' && max > 0 && phoneForLimit) {
                            // Count already claimed tickets for this phone across the event (this treats the limit as an event-level cap)
                            const alreadyClaimed = await tx.attendee.count({
                                where: {
                                    phoneNumber: phoneForLimit,
                                    eventId: eventId,
                                },
                            });

                            // Use totalRequestedQuantity to account for all tickets in this purchase
                            if (alreadyClaimed + totalRequestedQuantity > max) {
                                throw new Error('Ticket limit exceeded for this user');
                            }
                        }
        }

        if (promoCode) {
            const validatedPromo = await validatePromoCode(promoCode, eventId);
            if (!validatedPromo) throw new Error("Invalid or expired promo code.");
            
            if (validatedPromo.type === 'PERCENTAGE') {
                discountAmount = totalAmount * (Number(validatedPromo.value) / 100);
            } else {
                discountAmount = Math.min(totalAmount, Number(validatedPromo.value));
            }
            totalAmount -= discountAmount;

            await tx.promoCode.update({
                where: { id: validatedPromo.id },
                data: { uses: { increment: 1 } }
            });
        }
        
        const finalAmount = totalAmount;
        
        // This is a placeholder for the actual payment gateway interaction
        console.log(`Initiating payment for ${finalAmount.toFixed(2)} ETB...`);
        const paymentSessionId = `MOCK_${''}${randomUUID()}`;

        // Create a single attendee record for the entire purchase
        const firstTicket = tickets[0];
        if (!firstTicket) throw new Error("No tickets in purchase request.");

        const totalQuantity = totalRequestedQuantity;

        const newAttendee = await tx.attendee.create({
            data: {
                name: attendeeDetails.name,
                phoneNumber: normalizedPhone ?? attendeeDetails.phone,
                userId: attendeeDetails.userId || user?.id,
                eventId: eventId,
                ticketTypeId: firstTicket.id, // Primary ticket type
                qrCode: randomUUID(),
            }
        });

        // Update ticket counts
        for (const ticket of tickets) {
             await tx.ticketType.update({
                where: { id: ticket.id },
                data: { sold: { increment: ticket.quantity } }
            });
        }
        
        const order = await tx.pendingOrder.create({
            data: {
                arifpaySessionId: paymentSessionId,
                transactionId: paymentSessionId, // Using the same for simplicity in mock
                eventId: eventId,
                ticketTypeId: firstTicket.id,
                attendeeData: {
                    ...attendeeDetails,
                    phone: normalizedPhone ?? attendeeDetails.phone,
                    quantity: totalQuantity,
                    tickets: tickets,
                },
                attendeeId: newAttendee.id,
                status: 'COMPLETED' // Mocking completion
            }
        });

        revalidatePath(`/events/${eventId}`);
        revalidatePath('/dashboard');
        
        return serialize({
            success: true,
            redirectUrl: allSelectedFree ? `/ticket/${newAttendee.id}/confirmation` : `/payment/success?session_id=${paymentSessionId}`
        });
    });
}

export async function getTicketDetailsForConfirmation(identifier: string) {
    const isNumericId = /^\d+$/.test(identifier);

    let whereClause;
    if (isNumericId) {
        whereClause = { id: parseInt(identifier, 10) };
    } else {
        // If it's not numeric, assume it's a transactionId from the payment success page
        const order = await prisma.pendingOrder.findFirst({
            where: { 
                OR: [
                    { transactionId: identifier },
                    { arifpaySessionId: identifier }
                ]
             },
        });
        if (!order || !order.attendeeId) return null;
        whereClause = { id: order.attendeeId };
    }

    const attendee = await prisma.attendee.findUnique({
        where: whereClause,
        include: {
            event: true,
            ticketType: true,
        },
    });

    return serialize(attendee);
}

export async function getTicketsForUser(
  requester: { id: string; role: { name: string }; phoneNumber?: string } | null,
  userId?: string,
  phoneNumber?: string
) {
    const authRequester = requester ?? await requireAuthenticatedUser();

    if (!userId && !phoneNumber) {
        return [];
    }

    // Only allow requesting your own tickets unless you're Admin.
    if (authRequester.role.name !== 'Admin') {
        if (userId && userId !== authRequester.id) {
            throw new Error('Permission denied.');
        }
        // Phone-number lookups:
        // - Admin: allowed
        // - Guest: allowed only for the authenticated guest's own phone number
        if (phoneNumber) {
            const isGuest = authRequester.role.name === 'Guest';
            if (!isGuest) {
                throw new Error('Permission denied.');
            }

            const requesterPhone = authRequester.phoneNumber;
            if (!requesterPhone) {
                throw new Error('Permission denied.');
            }

            const providedVariants = buildPhoneVariants(phoneNumber);
            const requesterVariants = buildPhoneVariants(requesterPhone);
            const phoneMatches = providedVariants.some(v => requesterVariants.includes(v));
            if (!phoneMatches) {
                throw new Error('Permission denied.');
            }
        }
    }

    const whereClauses: any[] = [];
    if (userId) {
        whereClauses.push({ userId: userId });
    }

    if (phoneNumber) {
        const phoneVariants = buildPhoneVariants(phoneNumber);
        if (phoneVariants.length > 0) {
            whereClauses.push({ phoneNumber: { in: phoneVariants } });
        } else {
            const normalized = normalizePhoneNumber(phoneNumber);
            if (normalized) {
                whereClauses.push({ phoneNumber: normalized });
            }
        }
    }

    if (whereClauses.length === 0) {
        return [];
    }

    const attendees = await prisma.attendee.findMany({
        where: {
            OR: whereClauses,
        },
        include: {
            event: true,
            ticketType: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    return serialize(attendees);
}


export async function getTicketsByUserId(userId: string | null) {
  const requester = await requireAuthenticatedUser();
  if (!userId) return [];

  if (requester.role.name !== 'Admin' && requester.id !== userId) {
    throw new Error('Permission denied.');
  }

  const tickets = await prisma.attendee.findMany({
    where: { userId },
    include: {
      event: true,
      ticketType: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return serialize(tickets);
}

export async function validatePromoCode(code: string, eventId: number, location?: string | null, ticketTypesInCart?: { id: number; name: string }[]): Promise<PromoCode | null> {
    const promos = await prisma.promoCode.findMany({
        where: {
            eventId: eventId,
            uses: {
                lt: prisma.promoCode.fields.maxUses
            }
        }
    });

    for (const promo of promos) {
        // No restrictions, just match the code
        if (promo.code === code) return serialize(promo);

        // Check for structured codes
        if (promo.code.includes(':')) {
            const parts = promo.code.split(':');
            const type = parts[0];
            const value = parts[1];
            const actualCode = parts[2];

            if (actualCode === code) {
                if (type === 'TICKET' && ticketTypesInCart) {
                    if (ticketTypesInCart.some(t => t.name === value)) {
                        return serialize(promo);
                    }
                }
                if (type === 'LOCATION' && location) {
                    if (location === value) {
                        return serialize(promo);
                    }
                }
            }
        }
    }

    return null;
}


export async function checkInAttendee(attendeeIdentifier: number | string) {
    'use server';
    try {
        const user = await requirePermission('Scan QR:Access');

        const normalizedIdentifier =
            typeof attendeeIdentifier === 'number'
                ? attendeeIdentifier.toString()
                : attendeeIdentifier?.trim();

        if (!normalizedIdentifier) {
            return { error: 'Invalid Ticket: QR data is missing.' };
        }

        const isNumericId = /^\d+$/.test(normalizedIdentifier);

        const attendee = await prisma.attendee.findUnique({
            where: isNumericId
                ? { id: parseInt(normalizedIdentifier, 10) }
                : { qrCode: normalizedIdentifier },
            include: { event: true, ticketType: true }
        });

        if (!attendee) {
            return { error: 'Invalid Ticket: This ticket does not exist.' };
        }

        // Non-admins can only check in attendees for their own events
        if (user.role.name !== 'Admin' && attendee.event.organizerId !== user.id) {
            return { error: 'Permission denied.' };
        }

        if (attendee.checkedIn) {
            return { data: serialize(attendee), error: 'Already Checked In: This ticket has already been used.' };
        }

        const updatedAttendee = await prisma.attendee.update({
            where: { id: attendee.id },
            data: { checkedIn: true },
            include: { event: true, ticketType: true }
        });
        
        revalidatePath(`/dashboard/events/${attendee.eventId}`);

        return { data: serialize(updatedAttendee) };

    } catch (error) {
        console.error("Check-in error:", error);
        return { error: 'An unexpected error occurred during check-in.' };
    }
}

// Branch and District Actions
export async function createDistrict(data: { districtName: string; contactPersonName: string; contactPersonPhone: string; }) {
  await requirePermission('Staff Management:Access');
  const { districtName, ...rest } = data;
  const normalizedPhone = normalizeEthiopianPhoneStrict(rest.contactPersonPhone);
  const district = await prisma.district.create({
    data: {
      name: districtName,
      ...rest,
      contactPersonPhone: normalizedPhone,
    },
  });
  revalidatePath('/dashboard/settings/branch-district-registration');
  return serialize(district);
}

export async function createBranch(data: { branchName: string; districtId: string; contactPersonName: string; contactPersonPhone: string; }) {
  await requirePermission('Staff Management:Access');
  const { branchName, ...rest } = data;
  const normalizedPhone = normalizeEthiopianPhoneStrict(rest.contactPersonPhone);
  const branch = await prisma.branch.create({
    data: {
      name: branchName,
      ...rest,
      contactPersonPhone: normalizedPhone,
    },
  });
  revalidatePath('/dashboard/settings/branch-district-registration');
  return serialize(branch);
}

export async function getDistricts(): Promise<District[]> {
    const requester = await requireAuthenticatedUser();
    const canAccess =
      hasPermission(requester.role, 'Staff Management:Access') ||
      ['User Management:Read', 'User Management:Create', 'User Management:Update', 'User Management:Delete'].some(p =>
        hasPermission(requester.role, p)
      );

    if (!canAccess) {
      throw new Error('Permission denied.');
    }

    const districts = await prisma.district.findMany();
    return serialize(districts);
}

export async function getBranches(): Promise<Branch[]> {
    const requester = await requireAuthenticatedUser();
    const canAccess =
      hasPermission(requester.role, 'Staff Management:Access') ||
      ['User Management:Read', 'User Management:Create', 'User Management:Update', 'User Management:Delete'].some(p =>
        hasPermission(requester.role, p)
      );

    if (!canAccess) {
      throw new Error('Permission denied.');
    }

    const branches = await prisma.branch.findMany({ include: { district: true }});
    return serialize(branches);
}

export async function addUser(
  data: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
    roleId?: string;
    branchId?: string;
    nibBankAccount?: string | null;
  },
  isStaff: boolean = false
): Promise<{ success: boolean; error?: string }> {
    const creator = await requireAuthenticatedUser();
    if (isStaff) {
        if (!hasPermission(creator.role, 'Staff Management:Access')) {
            return { success: false, error: 'Permission denied.' };
        }
    } else {
        if (!hasPermission(creator.role, 'User Management:Create')) {
            return { success: false, error: 'Permission denied.' };
        }
    }

    try {
        let normalizedPhone: string;
        try {
            normalizedPhone = normalizeEthiopianPhoneStrict(data.phoneNumber);
        } catch (e: any) {
            return { success: false, error: e?.message || 'Invalid phone number.' };
        }

        const existingUserByPhone = await prisma.user.findUnique({
            where: { phoneNumber: normalizedPhone },
        });
        if (existingUserByPhone) {
            return { success: false, error: 'Phone number is already registered.' };
        }

        const existingUserByEmail = await prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingUserByEmail) {
            return { success: false, error: 'Email is already registered.' };
        }
        
        const tempPassword = nanoid(10);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        let roleId = data.roleId;
        let organizerId: string | undefined = undefined;

        if (isStaff) {
             const staffRole = await prisma.role.findFirst({ where: { name: 'Staff' } });
             if (!staffRole) {
                return { success: false, error: 'Default role "Staff" not found.' };
            }
            roleId = staffRole.id;
            organizerId = creator.id; // Assign the creator as the organizer for the staff member
        } else {
            // Validate the role assignment against the centralized security policy.
            // This ensures only authorized roles can be assigned by the creator.
            try {
                await validateRoleAssignment(creator, undefined, roleId);
            } catch (e: any) {
                return { success: false, error: e?.message || 'Permission denied.' };
            }
        }
        

        const user = await prisma.user.create({
            data: {
                id: cuid(),
                firstName: data.firstName,
                lastName: data.lastName,
                phoneNumber: normalizedPhone,
                email: data.email,
                password: hashedPassword,
                roleId: roleId as string,
                branchId: data.branchId || null,
                nibBankAccount: data.nibBankAccount || null,
                status: 'ACTIVE',
                passwordChangeRequired: true,
                organizerId: organizerId,
                tokenVersion: 1, // Initialize token version
            },
        });
        
        await sendTempPassword({
            email: data.email,
            phoneNumber: normalizedPhone,
            tempPassword: tempPassword,
        });

        return { success: true };

    } catch (error: any) {
        console.error("Failed to add user:", error);
        
        // Check for specific Prisma unique constraint errors
        if (error.code === 'P2002') {
             if (error.meta?.target?.includes('phoneNumber')) {
                return { success: false, error: "This phone number is already in use." };
            }
            if (error.meta?.target?.includes('email')) {
                return { success: false, error: "This email address is already in use." };
            }
        }

        return { success: false, error: error.message || "An unexpected error occurred." };
    }
}

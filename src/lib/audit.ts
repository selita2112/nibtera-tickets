'use server';

import { headers } from 'next/headers';
import prisma from './prisma';

type AuditInput = {
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: Record<string, any>;
  status?: 'SUCCESS' | 'FAILURE';
};

export async function logAudit(input: AuditInput) {
  try {
    const hdrs = await headers();
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      undefined;
    const userAgent = hdrs.get('user-agent') || undefined;

    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        userName: input.userName ?? undefined,
        userRole: input.userRole ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ? String(input.entityId) : undefined,
        details: input.details ?? undefined,
        ip,
        userAgent,
        status: input.status ?? 'SUCCESS',
      },
    });
  } catch (err) {
    console.error('[AUDIT_LOG_FAILED]', err);
  }
}
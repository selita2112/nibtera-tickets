// This example file has been removed as it was causing build errors
// by referencing deprecated functions (requireAuth, requirePermission).
// The correct way to protect API routes now is to manually call `verifyAuth`
// from within the route handler.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-middleware';

export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);

  if (!user) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  // Example of a permission check:
  if (user.role.name !== 'Admin' && !user.role.permissions.includes('Events:Read')) {
     return NextResponse.json({ message: 'Permission denied' }, { status: 403 });
  }

  return NextResponse.json({ message: 'Access granted', user: { id: user.id, role: user.role.name } });
}

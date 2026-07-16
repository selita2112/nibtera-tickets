
import { NextRequest, NextResponse } from 'next/server';
import { getPermissionsGroups } from '@/lib/permissions';
import { verifyAuth } from '@/lib/auth-middleware';
import { hasPermission } from '@/lib/permissions';

// Ensure this route is always dynamic and not served from cache.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    if (!hasPermission(user.role as any, 'Role Management:Read')) {
      return NextResponse.json({ message: 'Permission denied' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    const groups = getPermissionsGroups();
    return NextResponse.json(
      { permissions: groups },
      {
        status: 200,
        headers: {
          // Prevent any caching so clients (especially right after login)
          // always receive the current permissions.
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[PERMISSIONS_API_ERROR]', error);
    return NextResponse.json(
      { permissions: {} },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

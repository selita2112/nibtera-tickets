// app/api/debug/log-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-middleware';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }
    if (user.role.name !== 'Admin') {
      return NextResponse.json({ success: false, error: 'Permission denied.' }, { status: 403 });
    }

    const { paymentToken, transactionId } = await req.json();

    if (!paymentToken || !transactionId) {
      return NextResponse.json({ success: false, error: "Missing token or transactionId" }, { status: 400 });
    }

    // Avoid logging raw tokens (sensitive). Log only minimal metadata.
    console.log(`[DEBUG] Payment token received for transaction ${transactionId} (len=${String(paymentToken).length}).`);


    return NextResponse.json({ success: true, message: "Token logged successfully" });
  } catch (err: any) {
    console.error('[DEBUG] Failed to log payment token:', err);
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 });
  }
}

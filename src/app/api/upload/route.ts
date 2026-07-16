
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-middleware';
import { hasPermission } from '@/lib/permissions';


export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }
    if (!hasPermission(user.role as any, 'Events:Update') && !hasPermission(user.role as any, 'Events:Create')) {
      return NextResponse.json({ success: false, error: 'Permission denied.' }, { status: 403 });
    }

    const { file } = await req.json();

    if (!file || typeof file !== 'string' || !file.startsWith('data:image/')) {
      return NextResponse.json({ success: false, error: 'Invalid file data provided. Expected a data URI.' }, { status: 400 });
    }

       // In a real-world scenario, you would upload the base64-decoded data to a cloud storage service (e.g., Firebase Storage, S3)
    // and return the public URL.
    // For this prototype, we will simply return the received data URI directly.
    // This allows the frontend to use the exact uploaded image without needing a separate storage backend for this demo.
    const imageUrl = file;


    return NextResponse.json({ success: true, url: imageUrl });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}

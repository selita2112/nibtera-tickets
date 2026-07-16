import { NextResponse } from 'next/server';
import { getPublicEvents } from '@/lib/actions';

export async function GET() {
  try {
    const events = await getPublicEvents();
    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching public events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}




'use client';

import { useState, useEffect, Suspense } from 'react';
import { notFound, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { User, Calendar, MapPin, Ticket as TicketIcon, X, Loader2 } from 'lucide-react';
import { getTicketDetailsForConfirmation } from '@/lib/actions';
import type { Attendee, Event, TicketType } from '@prisma/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface TicketDetails extends Attendee {
  event: Event;
  ticketType: TicketType;
}

function formatEventDate(startDate: Date, endDate: Date | null | undefined): string {
  const startDateFormat = 'EEE, LLL dd, yyyy @ hh:mm a';
  if (endDate) {
    const endDateFormat =
      format(new Date(endDate), 'LLL dd, y') === format(new Date(startDate), 'LLL dd, y')
        ? 'hh:mm a'
        : startDateFormat;
    return `${format(new Date(startDate), startDateFormat)} - ${format(
      new Date(endDate),
      endDateFormat
    )}`;
  }
  return format(new Date(startDate), startDateFormat);
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get('transaction_id');
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketDetails | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showFullQR, setShowFullQR] = useState(false);

  useEffect(() => {
    if (!transactionId) {
      setLoading(false);
      notFound();
      return;
    }

    const showToast = sessionStorage.getItem('showSuccessToast');
    if (showToast) {
      toast({
        title: 'Purchase Successful!',
        description: 'Your ticket is confirmed.',
        variant: 'default',
      });
      try {
        sessionStorage.removeItem('showSuccessToast');
      } catch (e) {
        console.warn("Could not remove sessionStorage item.");
      }
    }

    async function fetchTicketAndGenerateQR() {
      try {
        setLoading(true);
        const ticketDetails = await getTicketDetailsForConfirmation(transactionId);
        if (!ticketDetails) {
          setLoading(false);
          notFound();
          return;
        }

        setTicket(ticketDetails);

        const qrCodeData = ticketDetails.qrCode;
        if (!qrCodeData) {
          throw new Error("Secure QR code identifier not found for this ticket.");
        }
        
        const dataUrl = await QRCode.toDataURL(qrCodeData, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error: any) {
        console.error('Failed to fetch ticket or generate QR code:', error);
        toast({
          variant: 'destructive',
          title: 'Error Loading Ticket',
          description: error.message || 'Could not load ticket details. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchTicketAndGenerateQR();
  }, [transactionId, toast]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-full max-w-sm">
          <Skeleton className="h-[600px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return notFound();
  }

  return (
    <>
      <div className="flex justify-center items-center min-h-screen bg-gray-50 py-6 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          <div className="bg-[#864b20] text-white p-5 text-center">
            <h1 className="text-2xl font-bold">Event Pass</h1>
            <p className="text-sm opacity-90 mt-1">Your ticket for {ticket.event.name}</p>
          </div>

          <div className="flex flex-col items-center py-6 px-5">
            <div
              className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:scale-105 transition-transform"
              onClick={() => setShowFullQR(true)}
            >
              <img
                src={qrCodeDataUrl}
                alt="QR Code"
                className="w-44 h-44 object-contain"
              />
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center max-w-[220px]">
              Tap the QR code to view in fullscreen.
            </p>
          </div>

          <div className="px-6 pb-6 text-sm text-gray-700 space-y-3 border-t border-gray-100">
            <div className="flex justify-between items-center pt-4">
              <span className="flex items-center gap-2 text-gray-500">
                <User className="h-4 w-4" /> Attendee
              </span>
              <span className="font-semibold">{ticket.name}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500">
                <TicketIcon className="h-4 w-4" /> Ticket Type
              </span>
              <span className="font-semibold">
                {ticket.ticketType.name.split(' - ')[0]}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500">
                <Calendar className="h-4 w-4" /> Date
              </span>
              <span className="font-semibold text-right">
                {formatEventDate(ticket.event.startDate, ticket.event.endDate)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-500">
                <MapPin className="h-4 w-4" /> Location
              </span>
              <span className="font-semibold">{ticket.event.location.split('||')[0]}</span>
            </div>
          </div>

          <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-center">
            <Button
              asChild
              variant="outline"
              className="w-full font-semibold border-orange-400 text-orange-500 hover:bg-orange-50"
            >
              <Link href="/tickets">Close</Link>
            </Button>
          </div>
        </div>
      </div>
      
      {showFullQR && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col justify-center items-center z-50">
          <button
            className="absolute top-5 right-5 text-white p-2 rounded-full bg-white/20 hover:bg-white/30 transition"
            onClick={() => setShowFullQR(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={qrCodeDataUrl}
            alt="QR Code Fullscreen"
            className="w-80 h-80 sm:w-96 sm:h-96 object-contain rounded-lg shadow-lg"
          />
          <p className="text-white text-sm mt-4 opacity-80">Tap close to return</p>
        </div>
      )}
    </>
  );
}


export default function TicketConfirmationPage() {
    return (
        <Suspense fallback={
             <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        }>
            <ConfirmationContent />
        </Suspense>
    )
}


'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, Ticket } from 'lucide-react';
import api from '@/lib/api';
import { getPrimaryEventImage } from '@/lib/event-images';
import { useToast } from '@/hooks/use-toast';

interface Event {
  id: string;
  name: string;
  image: string | null;
  startDate: Date;
  endDate: Date | null;
  location: string;
}

interface TicketType {
  id: string;
  name: string;
}

interface Attendee {
  id: string;
  userId: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  event: Event;
  ticketType: TicketType;
}

const DEFAULT_IMAGE_PLACEHOLDER = '/images/nibtickets.jpg';

function formatEventDate(startDate: Date, endDate: Date | null | undefined): string {
  const startDateFormat = 'LLL dd, y, hh:mm a';
  if (endDate) {
    const endDateFormat =
      format(new Date(endDate), 'LLL dd, y') === format(new Date(startDate), 'LLL dd, y')
        ? 'hh:mm a'
        : startDateFormat;
    return `${format(new Date(startDate), startDateFormat)} - ${format(new Date(endDate), endDateFormat)}`;
  }
  return format(new Date(startDate), startDateFormat);
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroredImages, setErroredImages] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    async function fetchTickets() {
      setLoading(true);
      try {
        const response = await api.get('/api/auth/cookie-data');
        const phoneNumber = response.data?.data?.phoneNumber;
        const userId = response.data?.data?.userId;

        if (!phoneNumber && !userId) {
          console.log("No user session found.");
          setTickets([]);
          return;
        }

        const ticketResponse = await api.get('/api/tickets', {
          params: {
            ...(userId ? { userId } : {}),
            ...(phoneNumber ? { phoneNumber } : {}),
          },
        });

        setTickets(ticketResponse.data?.data ?? []);
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;

        if (status === 404) {
          setTickets([]);
        } else {
          console.error('❌ Failed to fetch tickets:', error);
          toast({
            variant: "destructive",
            title: "Could not load tickets",
            description: "There was a problem retrieving your tickets. Please try again later.",
          });
          setTickets([]);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchTickets();
  }, [toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 w-full max-w-6xl">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="overflow-hidden rounded-2xl shadow-md border border-gray-200">
              <CardHeader className="p-0">
                <Skeleton className="w-full aspect-video rounded-t-lg" />
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-10 px-4">
      <div className="max-w-5xl mx-auto text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#864b20]">🎟️ My Tickets</h1>
          </div>

      {tickets.length > 0 ? (
        <div className="space-y-10 max-w-6xl mx-auto">
          {(() => {
            const now = new Date();
            const activeTickets = tickets.filter((ticket) => {
              const eventEndDate = ticket.event.endDate ? new Date(ticket.event.endDate) : new Date(ticket.event.startDate);
              return eventEndDate >= now;
            });
            const expiredTickets = tickets.filter((ticket) => {
              const eventEndDate = ticket.event.endDate ? new Date(ticket.event.endDate) : new Date(ticket.event.startDate);
              return eventEndDate < now;
            });
            const renderTicketCard = (ticket: Attendee) => {
            const primary = getPrimaryEventImage(ticket.event.image) || DEFAULT_IMAGE_PLACEHOLDER;
            const imageSource = erroredImages[ticket.id] ? DEFAULT_IMAGE_PLACEHOLDER : primary;
            return (
              <Card
                key={ticket.id}
                className="bg-white shadow-md hover:shadow-lg transition-all rounded-2xl overflow-hidden border border-gray-200"
              >
                <CardHeader className="p-0 relative h-36 sm:h-48">
                  <Image
                    src={imageSource}
                    alt={ticket.event.name}
                    fill
                    className="object-cover rounded-t-2xl"
                    onError={() => setErroredImages(prev => ({ ...prev, [ticket.id]: true }))}
                  />
                </CardHeader>
                <CardContent className="p-4 text-left">
                  <CardTitle className="text-lg font-semibold text-[#864b20]">{ticket.event.name}</CardTitle>
                  <CardDescription className="text-sm text-gray-500 mt-1">
                    {formatEventDate(ticket.event.startDate, ticket.event.endDate)}
                  </CardDescription>
                  <p className="text-sm text-gray-600 mt-2">Location: {ticket.event.location?.replace(/\|\|/g, ', ') || 'TBD'}</p>
                  <p className="font-semibold mt-2 text-[#f6b313]">{ticket.ticketType.name}</p>
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Button
                    asChild
                    className="w-full bg-[#864b20] hover:bg-[#6e3f1b] text-white font-semibold rounded-xl"
                  >
                    <Link href={`/ticket/${ticket.id}/confirmation`}>
                      View QR Code & Details
                      <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
            };

            return (
              <>
                <section>
                  <h2 className="text-2xl font-bold text-[#864b20] mb-4">Active / Upcoming Tickets</h2>
                  {activeTickets.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {activeTickets.map(renderTicketCard)}
                    </div>
                  ) : (
                    <p className="text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">No active or upcoming tickets.</p>
                  )}
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-[#864b20] mb-4">Expired Tickets</h2>
                  {expiredTickets.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {expiredTickets.map(renderTicketCard)}
                    </div>
                  ) : (
                    <p className="text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">No expired tickets.</p>
                  )}
                </section>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-20 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 max-w-xl mx-auto">
          <Ticket className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-2xl font-bold text-[#864b20]">No Tickets Yet</h3>
          <p className="text-gray-500 mt-2 mb-6">Your purchased tickets will appear here once available.</p>
          <Button
            asChild
            className="bg-[#864b20] hover:bg-[#6e3f1b] text-white rounded-xl px-6"
          >
            <Link href="/">Explore Events</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

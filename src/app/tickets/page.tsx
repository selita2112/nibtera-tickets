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
  id: number;
  userId: string | null;
  phoneNumber: string | null;
  checkedIn: boolean;
  createdAt: Date;
  event: Event;
  ticketType: TicketType;
}

const DEFAULT_IMAGE_PLACEHOLDER = '/images/nibtickets.jpg';
type TicketStatus = 'Used' | 'Expired' | 'Active' | 'Upcoming';
type TicketTab = 'Active' | 'Used' | 'Expired';

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
  const [selectedTab, setSelectedTab] = useState<TicketTab>('Active');
  const [erroredImages, setErroredImages] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const getTicketStatus = (ticket: Attendee): TicketStatus => {
    if (ticket.checkedIn) return 'Used';

    const now = new Date();
    const start = new Date(ticket.event.startDate);
    const end = ticket.event.endDate ? new Date(ticket.event.endDate) : null;

    if (end && end < now) return 'Expired';
    if (start <= now) return 'Active';
    return 'Upcoming';
  };

  const activeTickets = tickets.filter((ticket) => {
    const status = getTicketStatus(ticket);
    return status === 'Active' || status === 'Upcoming';
  });

  const purchasedAndExpiredTickets = tickets.filter((ticket) => {
    const status = getTicketStatus(ticket);
    return status === 'Used' || status === 'Expired';
  });

  const usedTickets = tickets.filter((ticket) => getTicketStatus(ticket) === 'Used');
  const expiredTickets = tickets.filter((ticket) => getTicketStatus(ticket) === 'Expired');

  const ticketsByTab: Record<TicketTab, Attendee[]> = {
    Active: activeTickets,
    Used: usedTickets,
    Expired: expiredTickets,
  };

  const selectedTickets = ticketsByTab[selectedTab];

  const statusClassMap: Record<TicketStatus, string> = {
    Upcoming: 'bg-blue-100 text-blue-700',
    Active: 'bg-green-100 text-green-700',
    Used: 'bg-amber-100 text-amber-700',
    Expired: 'bg-gray-200 text-gray-700',
  };

  useEffect(() => {
    async function fetchTickets() {
      setLoading(true);
      try {
        const response = await api.get('/api/auth/cookie-data');
let phoneNumber = response.data?.data?.phoneNumber;
const userId = response.data?.data?.userId;

// Fallback for guests who checked out on the public web (no SuperApp
// bridge cookie was ever set for them) — use the phone number saved
// locally at checkout time instead.
if (!phoneNumber && !userId && typeof window !== 'undefined') {
  phoneNumber = localStorage.getItem('nibtera_guest_phone') || undefined;
}

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
          // User has no session data yet—show empty state without surfacing an error toast.
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

  const renderTicketGrid = (ticketList: Attendee[]) => (
    <div className="grid gap-3 sm:gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
      {ticketList.map((ticket) => {
        const primaryImage = getPrimaryEventImage(ticket.event.image) || DEFAULT_IMAGE_PLACEHOLDER;
        const imageSource = erroredImages[ticket.id] ? DEFAULT_IMAGE_PLACEHOLDER : primaryImage;
        const status = getTicketStatus(ticket);

        return (
          <Card
            key={ticket.id}
            className="bg-white shadow-md hover:shadow-lg transition-all rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200"
          >
            <CardHeader className="p-0 relative h-24 sm:h-40">
              <Image
                src={imageSource}
                alt={ticket.event.name}
                fill
                className="object-cover rounded-t-xl sm:rounded-t-2xl"
                onError={() => setErroredImages((prev) => ({ ...prev, [ticket.id]: true }))}
              />
            </CardHeader>
            <CardContent className="p-3 sm:p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base sm:text-lg font-bold text-[#864b20] leading-tight">{ticket.event.name}</CardTitle>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusClassMap[status]}`}>
                  {status}
                </span>
              </div>
              <CardDescription className="text-xs sm:text-sm text-gray-500 mt-1">
                {formatEventDate(ticket.event.startDate, ticket.event.endDate)}
              </CardDescription>
              <p className="font-semibold mt-1.5 text-sm sm:text-base text-[#f6b313]">{ticket.ticketType.name}</p>
            </CardContent>
            <CardFooter className="p-3 sm:p-4 pt-0">
              <Button
                asChild
                className="w-full h-9 sm:h-10 bg-[#864b20] hover:bg-[#6e3f1b] text-white text-sm font-semibold rounded-lg sm:rounded-xl"
              >
                <Link href={`/ticket/${ticket.id}/confirmation`}>
                  View QR Code & Details
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-white py-10 px-4">
      <div className="max-w-5xl mx-auto text-center mb-8">
        <h1 className="text-3xl font-semibold text-[#864b20]">🎟️ My Tickets</h1>
      </div>

      {tickets.length > 0 ? (
        <div className="space-y-6 max-w-6xl mx-auto">
          <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            {(['Active', 'Used', 'Expired'] as TicketTab[]).map((tab) => {
              const isActive = selectedTab === tab;
              const count = ticketsByTab[tab].length;
              return (
                <Button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedTab(tab)}
                  variant={isActive ? 'default' : 'outline'}
                  className={isActive ? 'bg-[#864b20] hover:bg-[#6e3f1b] text-white rounded-full px-5' : 'rounded-full px-5'}
                >
                  {tab} ({count})
                </Button>
              );
            })}
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#864b20]">{selectedTab} Tickets</h2>
              <span className="text-sm text-gray-500">{selectedTickets.length} ticket(s)</span>
            </div>
            {selectedTickets.length > 0 ? (
              renderTicketGrid(selectedTickets)
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-500">
                {selectedTab === 'Active' && 'No active tickets waiting to be scanned.'}
                {selectedTab === 'Used' && 'No used tickets yet.'}
                {selectedTab === 'Expired' && 'No expired tickets yet.'}
              </div>
            )}
          </section>
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

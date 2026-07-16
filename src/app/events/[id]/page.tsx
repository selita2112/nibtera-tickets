


'use client';

import { getEventById, validatePromoCode, getTicketDetailsForConfirmation } from '@/lib/actions';
import { getEventImageUrls } from '@/lib/event-images';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ticket, Calendar, MapPin, Loader2, MinusCircle, PlusCircle, ShoppingCart, Info, User, Phone, ArrowLeft, X, UserCircle, GripVertical, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import type { Event, TicketType, PromoCode, Attendee } from '@prisma/client';
import { useEffect, useState, useTransition, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import CartSheet from '@/components/cart-sheet';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth, ensureCsrfToken } from '@/context/auth-context';
import api from '@/lib/api';
import QRCode from 'qrcode';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';


interface EventWithTickets extends Event {
    ticketTypes: (TicketType & { basePrice: number })[];
    organizerName?: string;
}

interface TicketDetails extends Attendee {
    event: Event;
    ticketType: TicketType;
}

export type SelectedTicket = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  total: number;
  sold: number;
  description?: string | null;
}

function formatEventDate(startDate: Date, endDate: Date | null | undefined): string {
    const startDateFormat = 'LLL dd, y, hh:mm a';
    
    if (endDate) {
      const endDateFormat = 'LLL dd, y, hh:mm a';
      return `Start Date: ${format(new Date(startDate), startDateFormat)}\nEnd Date: ${format(new Date(endDate), endDateFormat)}`;
    }
    return `Date: ${format(new Date(startDate), startDateFormat)}`;
}


const DEFAULT_IMAGE_PLACEHOLDER = '/images/nibtickets.jpg';

async function payWithYagout(transactionId: string, total: number) {
  const res = await api.post('/api/payment/yagout/initiate', {
    total,
    transactionId,
  });

  if (!res.data.success) {
    throw new Error(res.data.error || 'Failed to initiate YagoutPay payment.');
  }

  const { postUrl, meId, merchantRequest, hash } = res.data;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = postUrl;
  form.style.display = 'none';

  const addField = (name: string, value: string) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  addField('me_id', meId);
  addField('merchant_request', merchantRequest);
  addField('hash', hash);

  document.body.appendChild(form);
  form.submit(); // full-page navigation to Yagout's hosted checkout
}

export default function PublicEventDetailPage() {
  const router = useRouter();
  const params = useParams<{ id:string }>();
  const eventId = params ? parseInt(params.id, 10) : NaN;

  const [isPending, startTransition] = useTransition();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventWithTickets | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTickets, setSelectedTickets] = useState<Record<number, SelectedTicket>>({});
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [discount, setDiscount] = useState(0);
  const [isPromoLoading, setIsPromoLoading] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeePhone, setAttendeePhone] = useState('');
  const [isPhoneFromSession, setIsPhoneFromSession] = useState(false);
  const [existingClaimsCount, setExistingClaimsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentTransactionId, setPaymentTransactionId] = useState<string | null>(null);
  const [confirmedTicket, setConfirmedTicket] = useState<TicketDetails | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  
  useEffect(() => {
    if (isNaN(eventId)) {
        notFound();
    }
    
    async function fetchEvent() {
        setLoading(true);
        const eventData = await getEventById(eventId);
        if (!eventData) {
            notFound();
        }
        setEvent(eventData as EventWithTickets);

        // --- Set default location ---
        if (eventData?.location) {
            const locations = eventData.location.split('||').map((l: string) => l.trim());
            if (locations.length > 0) {
              setSelectedLocation(locations[0]);
            }
        }

        setLoading(false);
    }
    fetchEvent();
  }, [eventId]);


  const subtotal = useMemo(() => {
    return Object.values(selectedTickets).reduce((acc, ticket) => acc + ticket.price * ticket.quantity, 0);
  }, [selectedTickets]);

  const total = useMemo(() => {
    return subtotal - discount;
  }, [subtotal, discount]);

  // Free ticket support:
  // If all selected ticket tiers have base price of 0 ETB, skip external payment.
  const isFreeTicketPurchase = useMemo(() => {
    const selected = Object.values(selectedTickets);
    return selected.length > 0 && selected.every(t => Number(t.price) === 0);
  }, [selectedTickets]);
  
  const totalItems = useMemo(() => {
      return Object.values(selectedTickets).reduce((acc, ticket) => acc + ticket.quantity, 0);
  }, [selectedTickets]);
  
  const isEventEnded = useMemo(() => {
    if (!event) return false;
    const eventEnd = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
    return eventEnd.getTime() < Date.now();
  }, [event]);
  
  useEffect(() => {
    // When location changes, clear the cart to avoid price mismatches
    setSelectedTickets({});
  }, [selectedLocation]);

  useEffect(() => {
    async function fetchSessionData() {
        if (user) {
            if (user.phoneNumber) {
                let phone = user.phoneNumber;
                 if (phone.startsWith('251')) {
                    phone = '0' + phone.substring(3);
                }
                setAttendeePhone(phone);
                setIsPhoneFromSession(true);
            }
             if (!user.isGuest && user.firstName) {
                setAttendeeName(`${user.firstName} ${user.lastName || ''}`.trim());
            } else {
                setAttendeeName(''); 
            }
            return;
        }
          // If we have a phone number (guest or logged-in), fetch existing tickets to compute per-user limits
          if (attendeePhone) {
            try {
              const res = await api.get('/api/tickets', { params: { phoneNumber: attendeePhone } });
              if (res.data && Array.isArray(res.data.data)) {
                const ticketsForPhone = res.data.data as any[];
                const countForEvent = ticketsForPhone.filter(t => t.eventId === eventId).reduce((sum, t) => sum + 1, 0);
                setExistingClaimsCount(countForEvent);
              }
            } catch (e) {
              // ignore — permission checks may prevent phone lookups for non-matching sessions
            }
          }

        try {
            const response = await api.get('/api/auth/cookie-data');
            if (response.data.success && response.data.data.phoneNumber) {
                let phone = response.data.data.phoneNumber;
                if (phone.startsWith('251')) {
                    phone = '0' + phone.substring(3);
                }
                setAttendeePhone(phone);
                setIsPhoneFromSession(true);
            }
        } catch (error) {
            console.log("No guest session phone number found.");
        }
    }
    fetchSessionData();
  }, [user]);

  // When we have an attendee phone number (from session or input), fetch existing tickets for this phone to compute per-user limits
  useEffect(() => {
    async function fetchExistingClaims() {
      if (!attendeePhone) return;
      try {
        const res = await api.get('/api/tickets', { params: { phoneNumber: attendeePhone } });
        if (res.data && Array.isArray(res.data.data)) {
          const ticketsForPhone = res.data.data as any[];
          const countForEvent = ticketsForPhone.filter(t => t.eventId === eventId).length;
          setExistingClaimsCount(countForEvent);
        }
      } catch (e) {
        // ignore permission errors
      }
    }
    fetchExistingClaims();
  }, [attendeePhone, eventId]);

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'Technology':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Music':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Art':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'Community':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Business':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  const updateTicketQuantity = (
    ticketType: TicketType,
    quantity: number
  ) => {
      setSelectedTickets(prev => {
          const newSelected = { ...prev };
          if (quantity > 0) {
              newSelected[ticketType.id] = {
                  id: ticketType.id,
                  name: ticketType.name,
                  price: Number(ticketType.basePrice),
                  total: ticketType.total,
                  sold: ticketType.sold,
                  quantity: quantity,
                  description: ticketType.description
              };
          } else {
              delete newSelected[ticketType.id];
          }
          return newSelected;
      });
  };

  const handleApplyPromoCode = async () => {
    if (!promoCode) return;
    setIsPromoLoading(true);
    try {
        const ticketTypesInCart = Object.values(selectedTickets).map(t => ({ id: t.id, name: t.name }));
        const result = await validatePromoCode(promoCode, eventId, selectedLocation, ticketTypesInCart);
        if (result) {
            setAppliedPromo(result);
            toast({ title: "Success", description: "Promo code applied!" });
        } else {
            setAppliedPromo(null);
            toast({ variant: 'destructive', title: "Error", description: "Invalid or expired promo code for the selected ticket type or location." });
        }
    } catch (e) {
        setAppliedPromo(null);
        toast({ variant: 'destructive', title: "Error", description: "Could not validate promo code." });
    } finally {
        setIsPromoLoading(false);
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode('');
  }
  
  useEffect(() => {
    if (appliedPromo) {
      if (appliedPromo.type === 'PERCENTAGE') {
        setDiscount(subtotal * (Number(appliedPromo.value) / 100));
      } else if (appliedPromo.type === 'FIXED') {
        setDiscount(Math.min(subtotal, Number(appliedPromo.value)));
      }
    } else {
      setDiscount(0);
    }
  }, [appliedPromo, subtotal]);

  
    // This effect handles polling for payment status
    useEffect(() => {
        if (paymentStatus !== 'processing' || !paymentTransactionId) {
            return;
        }

        let isCancelled = false;
        let pollCount = 0;
        const maxPolls = 20; // Poll for 40 seconds

        const poll = async () => {
            if (isCancelled || pollCount >= maxPolls) {
                if (!isCancelled) {
                    setError("Payment confirmation timed out. Please check 'My Tickets' later or contact support if the issue persists.");
                    setPaymentStatus('failed');
                }
                return;
            }
            pollCount++;
            
            try {
                const response = await api.get(`/api/payment/status/${paymentTransactionId}`);
                if (response.data.status === 'COMPLETED') {
                    if (response.data.attendeeId) {
                        // Set success toast flag for confirmation page
                        try {
                            sessionStorage.setItem('showSuccessToast', 'true');
                        } catch (e) {
                            console.warn('Could not set sessionStorage flag');
                        }
                        // Redirect to confirmation page
                        router.push(`/ticket/${response.data.attendeeId}/confirmation`);
                        isCancelled = true; // Stop polling
                    } else {
                        // Fallback: try to get ticket details the old way
                        const ticketDetails = await getTicketDetailsForConfirmation(paymentTransactionId);
                        if (ticketDetails) {
                            try {
                                sessionStorage.setItem('showSuccessToast', 'true');
                            } catch (e) {
                                console.warn('Could not set sessionStorage flag');
                            }
                            router.push(`/ticket/${ticketDetails.id}/confirmation`);
                        } else {
                            throw new Error("Could not retrieve ticket details after confirmation.");
                        }
                        isCancelled = true; // Stop polling
                    }
                } else {
                    setTimeout(poll, 2000);
                }
            } catch (error) {
                console.error("Polling error", error);
                setTimeout(poll, 2000);
            }
        };

        poll();

        return () => { isCancelled = true; };
    }, [paymentStatus, paymentTransactionId, router]);


    const eventLocations = useMemo(() => {
        return event?.location ? Array.from(new Set(event.location.split('||').map(l => l.trim()))) : [];
    }, [event]);

    const locationSpecificTickets = useMemo(() => {
        if (!event) return [];
        // If there's only one location or no location selector is needed, show all tickets.
        if (eventLocations.length <= 1) {
            return event.ticketTypes;
        }
        // If multiple locations, filter by the selected one.
        if (selectedLocation) {
            return event.ticketTypes.filter(ticket => ticket.name.includes(` - ${selectedLocation}`));
        }
        return [];
    }, [event, selectedLocation, eventLocations]);

    const remainingTicketCount = useMemo(() => {
      return Math.max(locationSpecificTickets.length - 1, 0);
    }, [locationSpecificTickets.length]);

    const handleDownloadQRCode = () => {
        const qrImage = document.getElementById('qr-code-image') as HTMLImageElement;
        if (qrImage && confirmedTicket) {
            const link = document.createElement('a');
            link.href = qrImage.src;
            link.download = `ticket-qr-${confirmedTicket.event.name.replace(/\s+/g, '_')}-${confirmedTicket.id}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
  
  if (loading || !event) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center">
            <Button asChild variant="ghost">
              <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
              </Link>
            </Button>
          </div>
        </header>
        <main className="pt-16">
          <div className="container mx-auto max-w-5xl py-8 px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                    <Skeleton className="w-full aspect-[4/3] rounded-lg" />
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-3/4" />
                        <Skeleton className="h-6 w-1/2" />
                        <Skeleton className="h-6 w-1/3" />
                    </div>
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-3/4" />
                    </div>
                </div>
                <div className="space-y-8">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            </div>
          </div>
        </main>
      </div>
    )
  }
  
  const eventImageUrls = getEventImageUrls(event.image);
  const posterImage = eventImageUrls[0] || DEFAULT_IMAGE_PLACEHOLDER;
  const imageSource = posterImage;
  const homeLink = `/`;


  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center">
            <Button asChild variant="ghost">
              <Link href={homeLink}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
              </Link>
            </Button>
          </div>
        </header>
        <main className="pt-16">
          {/* Error Display */}
          {error && (
            <div className="container mx-auto max-w-5xl py-4 px-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Payment Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}
          <div 
            className="container mx-auto max-w-5xl py-8 px-4 pb-44 md:pb-8"
          >
              <div 
                  className="p-4 sm:p-8 rounded-xl bg-card text-card-foreground"
              >
                  <div className="grid md:grid-cols-5 gap-8">
                      <div className="md:col-span-3 space-y-8">
                          <div className="relative -mx-4 -mt-4 w-[calc(100%+2rem)] sm:-mx-8 sm:-mt-8 sm:w-[calc(100%+4rem)] aspect-video overflow-hidden">
                            <Image src={imageSource} alt={`${event.name} image`} fill className="h-full w-full object-cover object-center" data-ai-hint={event.hint ?? 'event'} onError={(e) => { const target = e.target as HTMLImageElement; target.src = DEFAULT_IMAGE_PLACEHOLDER; target.srcset = ''; }} />
                          </div>

                          <div className="rounded-lg p-0">
                              <Badge variant="outline" className={`mb-2 w-min whitespace-nowrap ${getCategoryBadgeClass(event.category)}`}>{event.category}</Badge>
                              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-card-foreground">{event.name}</h1>
                              {event.organizerName && (
                                  <div className="flex items-center gap-2 text-base sm:text-lg text-muted-foreground pt-3">
                                  <UserCircle className="h-5 w-5" />
                                  <span>By {event.organizerName}</span>
                                  </div>
                              )}
                              <div className="text-base sm:text-lg text-muted-foreground space-y-2 pt-4">
                                  <div className="flex items-center gap-3">
                                      <Calendar className="h-5 w-5" />
                                      <span className="whitespace-pre-line">{formatEventDate(event.startDate, event.endDate)}</span>
                                  </div>
                                  {eventLocations.length <= 1 && (
                                      <div className="flex items-start gap-3">
                                          <MapPin className="h-5 w-5 mt-1 flex-shrink-0" />
                                          <span>{event.location.replace(/\|\|/g, ', ')}</span>
                                      </div>
                                  )}
                                  {event.hint && (
                                      <div className="flex items-start gap-3 text-base">
                                      <Info className="h-5 w-5 mt-1 flex-shrink-0" />
                                      <p className="text-muted-foreground">{event.hint}</p>
                                      </div>
                                  )}
                              </div>
                          </div>

                          <div className="rounded-lg p-0">
                              <h3 className="text-xl sm:text-2xl font-semibold mb-4 text-card-foreground">About this Event</h3>
                              <p className="text-sm sm:text-base text-muted-foreground whitespace-pre-wrap leading-relaxed">{event.description}</p>
                          </div>
                      </div>

                      <div className="md:col-span-2 space-y-8">
                          <div className="rounded-lg p-0">
                              {eventLocations.length > 1 && (
                                  <div className="mb-6">
                                      <Label htmlFor="location-select" className="text-base sm:text-lg font-semibold mb-2 block">Location</Label>
                                      <Select
                                          value={selectedLocation || ''}
                                          onValueChange={(value) => setSelectedLocation(value)}
                                      >
                                          <SelectTrigger id="location-select">
                                              <SelectValue placeholder="Select a location" />
                                          </SelectTrigger>
                                          <SelectContent>
                                              {eventLocations.map(loc => (
                                                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                              ))}
                                          </SelectContent>
                                      </Select>
                                       <Alert variant="default" className="mt-4 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                                            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                            <AlertDescription className="text-blue-700 dark:text-blue-300 text-xs">
                                                Note: Ticket prices may vary by location.
                                            </AlertDescription>
                                        </Alert>
                                  </div>
                              )}
                              <h3 className="hidden md:block text-xl sm:text-2xl font-semibold mb-4 text-card-foreground">Tickets</h3>
                              {isEventEnded && (
                                <Alert variant="destructive" className="mb-4">
                                  <AlertCircle className="h-4 w-4" />
                                  <AlertDescription>
                                    This event has ended. Ticket sales are closed.
                                  </AlertDescription>
                                </Alert>
                              )}
                              <p className="text-sm text-muted-foreground mb-3 md:hidden">
                                Select ticket quantity from the bottom bar.
                              </p>
                              <div key={selectedLocation || 'default-location'} className="space-y-4 hidden md:block">
                                      {locationSpecificTickets.length > 0 ? (
                                      locationSpecificTickets.map(ticket => {
                                          const selectedQuantity = selectedTickets[ticket.id]?.quantity || 0;
                                          const remaining = ticket.total - ticket.sold;
                                          const isSoldOut = remaining <= 0;
                                          const isUnavailable = isSoldOut || isEventEnded;
                                          const baseName = ticket.name.split(' - ')[0];

                                          // Determine per-user max from preserved locationConfigs (fallback to legacy maxFreeTicketsPerPhone)
                                          const lpEntries: any[] = (ticket as any).locationConfigs ?? [];
                                          const normalizedLocation = selectedLocation ? String(selectedLocation).trim() : null;
                                          const matchedConfig = normalizedLocation
                                            ? lpEntries.find(e => (e?.location ? String(e.location).trim() : null) === normalizedLocation)
                                            : lpEntries[0];
                                          const perUserMax = (matchedConfig?.maxTicketsPerPhone ?? matchedConfig?.maxFreeTicketsPerPhone) as number | undefined;
                                          const allowedRemainingForUser = typeof perUserMax === 'number' && perUserMax > 0
                                            ? Math.max(0, perUserMax - existingClaimsCount)
                                            : undefined;
                                          const effectiveMax = typeof allowedRemainingForUser === 'number' ? Math.min(remaining, allowedRemainingForUser) : remaining;

                                          return (
                                              <div
                                                  key={ticket.id}
                                                  className="flex flex-col gap-2 p-4 rounded-lg border bg-secondary/30 backdrop-blur-sm shadow-md"
                                              >
                                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                                                      <div className="mb-3 sm:mb-0">
                                                          <h4 className="font-semibold text-base sm:text-lg">{baseName}</h4>
                                                          <p style={{ color: 'hsl(var(--accent))' }} className="font-bold text-lg sm:text-xl">
                                                              {Number(ticket.basePrice) === 0 ? 'Free' : `${Number(ticket.basePrice).toFixed(2)} ETB`}
                                                          </p>
                                                          <p className="text-sm text-muted-foreground">
                                                              {!isSoldOut ? `${remaining} remaining` : 'Sold Out'}
                                                          </p>
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                          <Button
                                                              size="icon"
                                                              variant="outline"
                                                              onClick={() => updateTicketQuantity(ticket, Math.max(0, selectedQuantity - 1))}
                                                              disabled={selectedQuantity === 0 || isEventEnded}
                                                          >
                                                              <MinusCircle className="h-4 w-4" />
                                                          </Button>
                                                            <Input
                                                              type="number"
                                                              className="w-16 h-10 text-center font-bold"
                                                              value={selectedQuantity}
                                                              onChange={(e) => {
                                                                  const value = e.target.value;
                                                                  const newQuantity = value === '' ? 0 : parseInt(value, 10);
                                                                  if (!isNaN(newQuantity)) {
                                                                  updateTicketQuantity(ticket, Math.min(effectiveMax, Math.max(0, newQuantity)));
                                                                  }
                                                              }}
                                                              onFocus={(e) => e.target.select()}
                                                              min={0}
                                                              max={effectiveMax}
                                                              disabled={isUnavailable}
                                                          />
                                                            <Button
                                                              size="icon"
                                                              variant="outline"
                                                              onClick={() => updateTicketQuantity(ticket, Math.min(effectiveMax, selectedQuantity + 1))}
                                                              disabled={isUnavailable || (typeof effectiveMax === 'number' ? selectedQuantity >= effectiveMax : selectedQuantity >= remaining)}
                                                            >
                                                              <PlusCircle className="h-4 w-4" />
                                                            </Button>
                                                      </div>
                                                  </div>
                                                        {ticket.description && <p className="text-sm text-muted-foreground pt-2 border-t">{ticket.description}</p>}
                                                        {isEventEnded && (
                                                          <p className="text-xs text-muted-foreground pt-1">Sales closed because the event has already ended.</p>
                                                        )}
                                                        {typeof perUserMax === 'number' && (
                                                          <p className="text-xs text-muted-foreground pt-1">
                                                            {allowedRemainingForUser === 0
                                                            ? `You have reached the maximum ${perUserMax} tickets allowed for this event.`
                                                            : `Maximum ${perUserMax} tickets allowed per user${typeof allowedRemainingForUser === 'number' ? ` — ${allowedRemainingForUser} remaining for you` : ''}`}
                                                          </p>
                                                        )}
                                              </div>
                                          );
                                      })
                                  ) : (
                                      <p className="text-muted-foreground">Tickets are not yet available for this event.</p>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
        </main>
      </div>

      {!isEventEnded && !isCartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-[1000] border-t bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/65 md:hidden">
          <div className="w-full -translate-y-[3mm] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
            {locationSpecificTickets.length > 0 ? (
              <>
                <Carousel opts={{ align: 'start' }} className="relative isolate z-0 w-full px-9">
                  {locationSpecificTickets.length > 1 && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 top-0 z-5 h-full w-12 bg-gradient-to-l from-background/95 via-background/70 to-transparent backdrop-blur-sm"
                    />
                  )}
                  <CarouselContent>
                  {locationSpecificTickets.map((ticket) => {
                    const selectedQuantity = selectedTickets[ticket.id]?.quantity || 0;
                    const remaining = ticket.total - ticket.sold;
                    const isSoldOut = remaining <= 0;
                    const isUnavailable = isSoldOut || isEventEnded;
                    const baseName = ticket.name.split(' - ')[0];
                    const lpEntries: any[] = (ticket as any).locationConfigs ?? [];
                    const normalizedLocation = selectedLocation ? String(selectedLocation).trim() : null;
                    const matchedConfig = normalizedLocation
                      ? lpEntries.find(e => (e?.location ? String(e.location).trim() : null) === normalizedLocation)
                      : lpEntries[0];
                    const perUserMax = (matchedConfig?.maxTicketsPerPhone ?? matchedConfig?.maxFreeTicketsPerPhone) as number | undefined;
                    const allowedRemainingForUser = typeof perUserMax === 'number' && perUserMax > 0
                      ? Math.max(0, perUserMax - existingClaimsCount)
                      : undefined;
                    const effectiveMax = typeof allowedRemainingForUser === 'number' ? Math.min(remaining, allowedRemainingForUser) : remaining;

                    return (
                      <CarouselItem key={ticket.id} className="basis-[95%]">
                        <div className="rounded-md border bg-secondary/20 px-2 py-2.5 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <h5 className="truncate font-semibold text-sm leading-tight">{baseName}</h5>
                              <p style={{ color: 'hsl(var(--accent))' }} className="font-bold text-sm leading-tight">
                                {Number(ticket.basePrice) === 0 ? 'Free' : `${Number(ticket.basePrice).toFixed(2)} ETB`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              onClick={() => updateTicketQuantity(ticket, Math.max(0, selectedQuantity - 1))}
                              disabled={selectedQuantity === 0 || isEventEnded}
                            >
                              <MinusCircle className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              className="h-9 w-12 px-1 text-center font-bold"
                              value={selectedQuantity}
                              onChange={(e) => {
                                const value = e.target.value;
                                const newQuantity = value === '' ? 0 : parseInt(value, 10);
                                if (!isNaN(newQuantity)) {
                                  updateTicketQuantity(ticket, Math.min(effectiveMax, Math.max(0, newQuantity)));
                                }
                              }}
                              onFocus={(e) => e.target.select()}
                              min={0}
                              max={effectiveMax}
                              disabled={isUnavailable}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              onClick={() => updateTicketQuantity(ticket, Math.min(effectiveMax, selectedQuantity + 1))}
                              disabled={isUnavailable || (typeof effectiveMax === 'number' ? selectedQuantity >= effectiveMax : selectedQuantity >= remaining)}
                            >
                              <PlusCircle className="h-4 w-4" />
                            </Button>
                            </div>
                          </div>
                        </div>
                      </CarouselItem>
                    );
                  })}
                  </CarouselContent>
                  <CarouselPrevious className="left-0 top-1/2 z-10 h-8 w-8 -translate-y-1/2" />
                  <CarouselNext className="right-0 top-1/2 z-10 h-8 w-8 -translate-y-1/2" />
                </Carousel>
                <p className="mt-1 px-1 text-sm font-medium text-[#864b20]">
                  {remainingTicketCount > 0
                    ? `Swipe for ${remainingTicketCount} more ${remainingTicketCount === 1 ? 'ticket' : 'tickets'}.`
                    : 'Swipe for more.'}
                </p>
                <p className="mt-0.5 text-center text-[11px] text-muted-foreground">
                  Powered by <span className="text-[#FDE047]">Nib International Bank</span>
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground px-2">Tickets are not yet available for this event.</p>
            )}
          </div>
        </div>
      )}

       {totalItems > 0 && !isEventEnded &&
        <CartSheet
            selectedTickets={selectedTickets}
            subtotal={subtotal}
            discount={discount}
            total={total}
            totalItems={totalItems}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            appliedPromo={appliedPromo}
            isPromoLoading={isPromoLoading}
            handleApplyPromoCode={handleApplyPromoCode}
            removePromoCode={removePromoCode}
            open={isCartOpen}
            onOpenChange={setIsCartOpen}
            updateTicketQuantity={(ticket: SelectedTicket, quantity: number) => {
                 const originalTicket = event?.ticketTypes.find(t => t.id === ticket.id);
                 if (originalTicket) {
                    updateTicketQuantity(originalTicket, quantity);
                 }
            }}
        >
            <Button
                onClick={() => setIsPurchaseModalOpen(true)}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                size="lg"
            >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Purchase Tickets
            </Button>
        </CartSheet>
      }

      <AlertDialog open={isPurchaseModalOpen} onOpenChange={setIsPurchaseModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attendee Information</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide your name and phone number for the ticket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="name" placeholder="Enter your full name" value={attendeeName} onChange={e => setAttendeeName(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    id="phone" 
                    placeholder="e.g., 0912345678" 
                    value={attendeePhone} 
                    onChange={e => setAttendeePhone(e.target.value)} 
                    className={cn("pl-10", isPhoneFromSession && "bg-muted cursor-not-allowed")}
                    readOnly={isPhoneFromSession}
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
  onClick={() => {
    startTransition(async () => {
      if (!attendeeName || !attendeePhone) {
        toast({
          variant: 'destructive',
          title: "Missing Information",
          description: "Please enter your name and phone number.",
        });
        return;
      }

      setIsPurchaseModalOpen(false);

      try {
        // Step 1: Create pending order
        const pendingOrderRes = await api.post('/api/payment/pending-order', {
          eventId,
          tickets: Object.values(selectedTickets),
          promoCode: appliedPromo?.code,
          attendeeDetails: { name: attendeeName, phone: attendeePhone, userId: user?.id },
        });

        if (!pendingOrderRes.data.success) {
          throw new Error(pendingOrderRes.data.error || 'Failed to create pending order.');
        }

        const { transactionId } = pendingOrderRes.data;
        setPaymentTransactionId(transactionId);

        // Free tickets: complete immediately and route to confirmation page.
        if (isFreeTicketPurchase) {
          const completeRes = await api.post('/api/payment/complete', { id: transactionId });
          const attendeeId = completeRes.data?.attendeeId;
          if (!attendeeId) {
            throw new Error('Ticket finalization failed for free ticket purchase.');
          }
          router.push(`/ticket/${attendeeId}/confirmation`);
          return;
        }

        // Step 2: Initiate payment
        setPaymentStatus('processing');

        if (typeof window !== 'undefined' && window.myJsChannel?.postMessage) {
          // Inside the NIBtera SuperApp webview — keep using the existing Mini-App flow.
          const paymentRes = await api.post('/api/payment/nib/initiate', {
            total,
            transactionId,
          });

          if (!paymentRes.data.success || !paymentRes.data.paymentToken) {
            throw new Error(paymentRes.data.error || "Failed to initiate payment.");
          }

          window.myJsChannel.postMessage({ type: 'PAYMENT', token: paymentRes.data.paymentToken });
          toast({ title: "Processing Payment", description: "Handing off to NIBtera Super App..." });
        } else {
          // Ordinary browser — send the user to YagoutPay's hosted checkout.
          await payWithYagout(transactionId, total);
          // form.submit() above navigates the page away; nothing else to do here.
        }

      } catch (err: any) {
        console.error("Payment initiation error:", err);
        const apiMessage =
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.message;
        setError(apiMessage || "Unknown error occurred.");
        toast({
          variant: 'destructive',
          title: 'Payment Failed',
          description: apiMessage || ''
        });
        setPaymentStatus('failed');
      }
    });
  }}
  disabled={isPending}
>
  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {isFreeTicketPurchase ? 'Get Free Ticket' : 'Proceed to Payment'}
</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={paymentStatus !== 'idle'} onOpenChange={(open) => !open && setPaymentStatus('idle')}>
        <DialogContent className="sm:max-w-md p-0" hideCloseButton>
            {paymentStatus === 'processing' && (
                 <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                    <DialogTitle className="text-2xl font-semibold">Finalizing Your Ticket...</DialogTitle>
                    <DialogDescription>Please wait while we confirm your payment. This may take a few moments.</DialogDescription>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm pt-4">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Do not close this window.</span>
                    </div>
                </div>
            )}
            {paymentStatus === 'success' && confirmedTicket && (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-green-100">
                        <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold">Purchase Successful!</h2>
                    <p className="text-muted-foreground mt-2">Thank you! Your ticket is confirmed.</p>
                    
                    <div className="space-y-4 my-6 w-full">
                        <p className="text-sm text-muted-foreground">Present this QR code at the event entrance for scanning.</p>
                        {qrCodeDataUrl && 
                            <div className="p-2 border-4 border-muted rounded-lg bg-white inline-block">
                                <img id="qr-code-image" src={qrCodeDataUrl} alt="Ticket QR Code" className="h-48 w-48 mx-auto" />
                            </div>
                        }
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <Button 
                            onClick={handleDownloadQRCode}
                            style={{ backgroundColor: '#f59e0b', color: '#422006' }} 
                            className="hover:bg-yellow-400/90"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Download QR Code
                        </Button>
                        <Button variant="outline" onClick={() => setPaymentStatus('idle')}>
                            Done
                        </Button>
                    </div>
                </div>
            )}
             {paymentStatus === 'failed' && (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-red-100">
                        <X className="h-10 w-10 text-red-600" />
                    </div>
                    <DialogTitle className="text-2xl font-bold">Payment Failed</DialogTitle>
                    <DialogDescription className="mt-2">{error || "We couldn't process your payment. Please try again."}</DialogDescription>
                    <Button variant="outline" className="mt-4" onClick={() => setPaymentStatus('idle')}>
                        Close
                    </Button>
                </div>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}

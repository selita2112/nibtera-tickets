

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CardContainer, CardBody, CardItem } from "@/components/ui/3d-card";
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Search, Ticket, Facebook, Linkedin, Instagram, Youtube, Send, Mic, Drama, MessageSquareHeart, Gamepad2, Presentation, Utensils, LayoutGrid, MapPin } from 'lucide-react';
import { getPublicEvents, getPublicHomeCarouselAds } from '@/lib/actions';
import { format } from 'date-fns';
import type { Event, TicketType } from '@prisma/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from "@/components/ui/input";
import HomeAdsCarousel from "@/components/home-ads-carousel";
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { getPrimaryEventImage } from '@/lib/event-images';
import HomeUserActions from '@/components/home-user-actions';


interface EventWithTickets extends Event {
    ticketTypes: TicketType[];
}
const TOP_SELLING_MIN_TICKETS_SOLD = 50;

function formatEventDate(startDate: Date, endDate: Date | null | undefined): string {
    const startDateFormat = 'LLL dd, y, hh:mm a';
    
    if (endDate) {
      const endDateFormat = 'LLL dd, y, hh:mm a';
      return `Start Date: ${format(new Date(startDate), startDateFormat)}\nEnd Date: ${format(new Date(endDate), endDateFormat)}`;
    }
    return `Date: ${format(new Date(startDate), startDateFormat)}`;
}

const DEFAULT_IMAGE_PLACEHOLDER = '/images/nibtickets.jpg';

const categoryIcons: { [key: string]: React.ReactNode } = {
    'All': <Ticket className="h-4 w-4" style={{ color: '#f59e0b' }} />,
    'Technology': <Presentation className="h-4 w-4" style={{ color: '#3b82f6' }} />,
    'Music': <Mic className="h-4 w-4" style={{ color: '#8b5cf6' }} />,
    'Art': <Drama className="h-4 w-4" style={{ color: '#ec4899' }} />,
    'Community': <MessageSquareHeart className="h-4 w-4" style={{ color: '#22c55e' }} />,
    'Business': <Gamepad2 className="h-4 w-4" style={{ color: '#6366f1' }} />,
    'Food & Drink': <Utensils className="h-4 w-4" style={{ color: '#f97316' }} />,
    'Food': <Utensils className="h-4 w-4" style={{ color: '#f97316' }} />,
    'Other': <Ticket className="h-4 w-4" style={{ color: '#f59e0b' }} />
};

function formatEventLocation(rawLocation: string | null | undefined): string {
  const value = (rawLocation ?? '').trim();
  if (!value) return 'TBD';
  return value.replace(/\|\|/g, ', ');
}

function getEventEnd(event: Pick<Event, 'startDate' | 'endDate'>) {
  return event.endDate ? new Date(event.endDate) : new Date(event.startDate);
}



function toStr(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref(base: string, params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v.trim()) sp.set(k, v.trim());
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function PublicHomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = (toStr(sp.q) ?? '').trim();
  const cat = (toStr(sp.cat) ?? 'All').trim();

  const [events, homeCarouselAds] = await Promise.all([getPublicEvents(), getPublicHomeCarouselAds()]);
  const now = new Date();
  const categories = ['All', ...Array.from(new Set(events.map((e) => e.category)))];
  
  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'Technology':
        return 'bg-blue-600 border-transparent text-white';
      case 'Music':
        return 'bg-purple-600 border-transparent text-white';
      case 'Art':
        return 'bg-pink-600 border-transparent text-white';
      case 'Community':
        return 'bg-green-600 border-transparent text-white';
      case 'Business':
          return 'bg-indigo-600 border-transparent text-white';
      default:
        return 'bg-amber-500 border-transparent text-black';
    }
  }
  
  const getContentGradient = () => {
    const yellowColor = '#FDE047'; // yellow
    return {
      background: `linear-gradient(to top, ${yellowColor}, ${yellowColor}40)`
    }
  }

  const filteredEvents = events.filter((event) => {
    const eventEndDate = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
    const isUpcoming = eventEndDate >= now;
    if (!isUpcoming) return false;
    const matchesCategory = cat === 'All' || event.category === cat;
    const matchesSearch =
      !q ||
      event.name.toLowerCase().includes(q.toLowerCase()) ||
      event.description.toLowerCase().includes(q.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const upcomingEvents = filteredEvents;
  const topSellingEvents = [...filteredEvents]
    .filter((event) => event.ticketTypes.reduce((sum, t) => sum + t.sold, 0) >= TOP_SELLING_MIN_TICKETS_SOLD)
    .sort((a, b) => {
      const salesA = a.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
      const salesB = b.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
      if (salesB !== salesA) return salesB - salesA;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

  const navbarStyle = { background: '#fefce5' };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
       <header className="fixed top-0 w-full z-50 hidden md:block" style={navbarStyle}>
        <nav className="container mx-auto px-4 sm:px-6 py-2 flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image
                src="/images/nibtickets.jpg"
                alt="Nibtera Tickets Logo"
                width={120}
                height={28}
                className="object-contain"
                data-ai-hint="logo nibtera"
            />
          </Link>
          
          <HomeUserActions />
        </nav>
      </header>

      <main className="flex-grow md:pt-16">
        <section className="relative w-full">
            <HomeAdsCarousel ads={homeCarouselAds} />

           <div className="absolute inset-0 pointer-events-none">
              {/* Gradient overlay: transparent top, darker bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

              {/* Title stays on-image */}
              <div className="absolute inset-x-0 top-0 pt-10 sm:pt-12 md:pt-16 px-4">
                <div className="mx-auto w-full max-w-3xl text-center text-white pointer-events-auto hidden sm:block">
                  <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight drop-shadow-md">
                    Discover Events Near You
                  </h1>
                  <p className="mt-2 md:mt-3 text-sm sm:text-base md:text-lg text-white/90">
                    Concerts, conferences, festivals — book fast and secure.
                  </p>
                </div>
              </div>

              {/* Floating search overlaps hero → content */}
              <div className="absolute inset-x-0 bottom-0 translate-y-[40%] px-4 pointer-events-auto">
                <div className="mx-auto w-full max-w-lg lg:max-w-2xl">
                  <form action="/" method="get" className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/70" />
                    <Input
                      placeholder="Search events, artists, venues"
                      name="q"
                      defaultValue={q}
                      className="pl-12 pr-4 py-6 text-base md:text-lg bg-white text-black placeholder:text-black/50 rounded-full shadow-2xl ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-amber-400"
                    />
                    <input type="hidden" name="cat" value={cat} />
                  </form>
                </div>
              </div>
            </div>
        </section>


        {/* Extra top padding to account for floating search overlap */}
        <section className="pt-16 pb-12 md:pt-20">
            <div className="container mx-auto px-4 lg:px-6">
                <div className="mb-6 sm:mb-8 rounded-2xl bg-white/70 backdrop-blur border border-black/5 shadow-sm px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-2xl font-extrabold tracking-tight text-[#864b20]">
                            Upcoming Events
                        </h2>
                        <p className="hidden sm:block text-sm text-black/60 mt-1">Handpicked experiences you can book right now.</p>

                        {/* Desktop: show category badges */}
                        <div className="hidden md:flex items-center gap-3 mt-3">
                          {categories.map((category) => {
                            const href = buildHref('/', { q, cat: category });
                            const selected = category === cat;
                            return (
                              <Link
                                key={category}
                                href={href}
                                className={cn(
                                  "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold shadow-sm",
                                  selected ? getCategoryBadgeClass(category) : 'bg-white border border-black/5 text-black'
                                )}
                              >
                                {categoryIcons[category] || <Ticket className="h-4 w-4" />}
                                <span>{category}</span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    <div className="flex items-center gap-3 md:hidden">
                        <div className="flex items-center gap-3">
                          {/* On mobile, ticket icon links to My Tickets */}
                          <Link
                            href="/tickets"
                            className="w-10 h-10 rounded-full bg-[#864b20] flex items-center justify-center text-white shadow-sm"
                            aria-label="My Tickets"
                          >
                            <Ticket className="h-4 w-4" />
                            <span className="sr-only">My Tickets</span>
                          </Link>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" className="rounded-full">
                                <LayoutGrid className="h-4 w-4" />
                                <span className="sr-only">Categories</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                {categories.map((category) => {
                                  const href = buildHref('/', { q, cat: category });
                                  return (
                                    <DropdownMenuItem key={category} asChild>
                                      <Link href={href} className="flex items-center gap-2">
                                        {categoryIcons[category] || <Ticket className="h-4 w-4" />}
                                        <span>{category}</span>
                                      </Link>
                                    </DropdownMenuItem>
                                  );
                                })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                    </div>
                  </div>
                </div>
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
                {false ? (
                    [...Array(8)].map((_, i) => (
                      <Card key={i} className="overflow-hidden">
                          <Skeleton className="w-full h-40" />
                          <CardContent className="p-4 space-y-2">
                            <Skeleton className="h-5 w-20" />
                            <Skeleton className="h-7 w-3/4" />
                            <Skeleton className="h-5 w-1/2" />
                          </CardContent>
                          <CardFooter className="p-4">
                            <Skeleton className="h-10 w-full rounded-full" />
                          </CardFooter>
                      </Card>
                    ))
                ) : (upcomingEvents.length > 0) ? (
                    upcomingEvents.map((event) => {
                      const imageSource = getPrimaryEventImage(event.image) || DEFAULT_IMAGE_PLACEHOLDER;
                      const eventLink = `/events/${event.id}`;
                      const hasFreeTier = event.ticketTypes.some((ticket) => Number(ticket.basePrice) === 0);
                      return (
                        <CardContainer key={event.id} className="inter-var w-full">
                          <CardBody className="bg-white relative group/card w-full rounded-2xl p-0 border border-black/10 shadow-md hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
                            <CardItem translateZ="50" className="w-full">
                               <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden">
                                  <Image src={imageSource} alt={event.name} fill className="object-cover" data-ai-hint={event.hint ?? 'event'} />
                                  {hasFreeTier && (
                                    <div className="pointer-events-none absolute -left-12 top-3 z-20 rotate-[-28deg] bg-yellow-600 px-14 py-1 text-center text-sm font-extrabold uppercase tracking-wide text-white shadow-md">
                                      Free
                                    </div>
                                  )}
                                  {/* Image overlay info */}
                                  <div className="absolute inset-0">
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                                    {/* Removed top-left calendar badge per design: dates moved below content */}
                                    <div className="absolute right-3 top-3">
                                      <Badge className={cn("text-xs font-semibold shadow-sm", getCategoryBadgeClass(event.category))}>
                                        {event.category}
                                      </Badge>
                                    </div>
                                    {/* Removed date text overlay from image; location overlay retained */}
                                    <div className="absolute inset-x-3 bottom-3 text-white">
                                      <div className="mt-1 flex items-start gap-2">
                                        <MapPin className="h-4 w-4 text-white/90 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm font-medium leading-snug line-clamp-2">
                                          {formatEventLocation(event.location)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                               </div>
                            </CardItem>
                            <div className="p-4 sm:p-5 flex flex-col flex-grow gap-4 bg-white">
                              <CardItem as="div" translateZ="40" className="space-y-1">
                                <h3 className="font-extrabold text-lg sm:text-xl text-black tracking-tight leading-snug line-clamp-2">
                                  {event.name}
                                </h3>
                                {/* Description removed per design. Render start/end dates below the title. */}
                                <div className="text-sm text-black/70">
                                  <div className="text-xs text-black/60">Start: {format(new Date(event.startDate), 'LLL dd, y, hh:mm a')}</div>
                                  {event.endDate && (
                                    <div className="text-xs text-black/60">End: {format(new Date(event.endDate), 'LLL dd, y, hh:mm a')}</div>
                                  )}
                                </div>
                              </CardItem>

                              <CardItem translateZ="30" className="mt-auto pt-1">
                                <Button
                                  asChild
                                  className="w-full rounded-full bg-[#864b20] text-white hover:bg-[#6e3f1b] h-11 sm:h-10 text-base sm:text-sm shadow-md"
                                >
                                  <Link href={eventLink} className="flex items-center justify-center gap-2">
                                    <Ticket className="h-4 w-4" />
                                    Buy Ticket
                                  </Link>
                                </Button>
                              </CardItem>
                            </div>
                          </CardBody>
                        </CardContainer>
                      )
                    })
                ) : (
                    <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 flex items-center justify-center p-8 text-center bg-gray-100 rounded-lg">
                    <div>
                        <h3 className="text-xl font-semibold tracking-tight">No Events Found</h3>
                        <p className="text-muted-foreground mt-1">Try adjusting your search or filter criteria.</p>
                    </div>
                    </div>
                )}
                </div>
            </div>
        </section>

        {topSellingEvents.length > 0 && (
        <section className="py-12">
            <div className="container mx-auto px-4 lg:px-6">
                <h2 className="text-2xl font-bold tracking-tight mb-6">
                    Top Selling Events
                </h2>
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
                    {topSellingEvents.slice(0, 4).map((event) => {
                      const imageSource = getPrimaryEventImage(event.image) || DEFAULT_IMAGE_PLACEHOLDER;
                      const eventLink = `/events/${event.id}`;
                      const hasFreeTier = event.ticketTypes.some((ticket) => Number(ticket.basePrice) === 0);
                      return (
                         <CardContainer key={event.id} className="inter-var w-full">
                          <CardBody className="bg-white relative group/card w-full rounded-2xl p-0 border border-black/10 shadow-md hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
                            <CardItem translateZ="50" className="w-full">
                               <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden">
                                  <Image src={imageSource} alt={event.name} fill className="object-cover" data-ai-hint={event.hint ?? 'event'} />
                                  {hasFreeTier && (
                                    <div className="pointer-events-none absolute -left-12 top-3 z-20 rotate-[-28deg] bg-red-600 px-14 py-1 text-center text-sm font-extrabold uppercase tracking-wide text-white shadow-md">
                                      Free
                                    </div>
                                  )}
                                  <div className="absolute inset-0">
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                                    {/* Removed top-left calendar badge per design: dates moved below content */}
                                    <div className="absolute right-3 top-3">
                                      <Badge className={cn("text-xs font-semibold shadow-sm", getCategoryBadgeClass(event.category))}>
                                        {event.category}
                                      </Badge>
                                    </div>
                                    {/* Removed date text overlay from image; location overlay retained */}
                                    <div className="absolute inset-x-3 bottom-3 text-white">
                                      <div className="mt-1 flex items-start gap-2">
                                        <MapPin className="h-4 w-4 text-white/90 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm font-medium leading-snug line-clamp-2">
                                          {formatEventLocation(event.location)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                               </div>
                            </CardItem>
                            <div className="p-4 sm:p-5 flex flex-col flex-grow gap-4 bg-white">
                              <CardItem as="div" translateZ="40" className="space-y-1">
                                <h3 className="font-extrabold text-lg sm:text-xl text-black tracking-tight leading-snug line-clamp-2">
                                  {event.name}
                                </h3>
                                {/* Description removed per design. Render start/end dates below the title. */}
                                <div className="text-sm text-black/70">
                                  <div className="text-xs text-black/60">Start: {format(new Date(event.startDate), 'LLL dd, y, hh:mm a')}</div>
                                  {event.endDate && (
                                    <div className="text-xs text-black/60">End: {format(new Date(event.endDate), 'LLL dd, y, hh:mm a')}</div>
                                  )}
                                </div>
                              </CardItem>

                              <CardItem translateZ="30" className="mt-auto pt-1">
                                <Button
                                  asChild
                                  className="w-full rounded-full bg-[#864b20] text-white hover:bg-[#6e3f1b] h-11 sm:h-10 text-base sm:text-sm shadow-md"
                                >
                                  <Link href={eventLink} className="flex items-center justify-center gap-2">
                                    <Ticket className="h-4 w-4" />
                                    Buy Ticket
                                  </Link>
                                </Button>
                              </CardItem>
                            </div>
                          </CardBody>
                        </CardContainer>
                      )
                    })}
                </div>
            </div>
        </section>
        )}

      </main>
      <Footer />
    </div>
  );
}


const Footer = () => (
    <footer className="py-8 hidden md:block" style={{background: 'linear-gradient(to right, #fefce8, #fde047)'}}>
      <div className="container mx-auto px-4 lg:px-6">
         <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-center text-accent">
            &copy; {new Date().getFullYear()} NibTera Tickets. All rights reserved.
          </p>
           <div className="flex space-x-4 mt-2">
              <Link href="https://web.facebook.com/nib.intbank" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-accent hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </Link>
              <Link href="https://www.linkedin.com/company/nib-internationalbank" target="_blank" rel="noopener noreferrer" aria-label="Linkedin" className="text-accent hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </Link>
              <Link href="https://www.instagram.com/nib_internationalbank/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-accent hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </Link>
              <Link href="https://www.youtube.com/channel/UCn_-tUsAPEKdzm_b2BOCOdA" target="_blank" rel="noopener noreferrer" aria-label="Youtube" className="text-accent hover:text-primary transition-colors">
                <Youtube className="h-5 w-5" />
              </Link>
              <Link href="https://t.me/nibinternationalbanksc" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="text-accent hover:text-primary transition-colors">
                <Send className="h-5 w-5" />
              </Link>
            </div>
        </div>
      </div>
    </footer>
)

    

    





    



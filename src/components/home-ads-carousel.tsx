'use client';

import * as React from 'react';
import Autoplay from 'embla-carousel-autoplay';
import Image from 'next/image';
import type { EmblaCarouselType } from 'embla-carousel';
import Link from 'next/link';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

export type HomeCarouselAdPublic = {
  id: number;
  imageUrl: string;
  title: string | null;
  caption: string | null;
  linkUrl: string | null;
};

const DEFAULT_IMAGE_PLACEHOLDER = '/images/nibtickets.jpg';

function SlideLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isInternal = href.startsWith('/') && !href.startsWith('//');
  if (isInternal) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function HomeAdsCarousel({ ads }: { ads: HomeCarouselAdPublic[] }) {
  const [api, setApi] = React.useState<EmblaCarouselType | undefined>();
  const [current, setCurrent] = React.useState(0);

  const plugin = React.useRef(
    Autoplay({ delay: 5000, stopOnInteraction: true, stopOnMouseEnter: true })
  );

  React.useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  if (!ads.length) {
    return (
      <div className="relative w-full aspect-[16/9] md:aspect-video max-h-[560px]">
        <Image
          src={DEFAULT_IMAGE_PLACEHOLDER}
          alt="Welcome"
          fill
          className="object-cover"
          priority
        />
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <Carousel
        setApi={setApi}
        plugins={[plugin.current]}
        className="w-full"
        onMouseEnter={() => plugin.current.stop()}
        onMouseLeave={() => plugin.current.play()}
        opts={{ loop: true }}
      >
        <CarouselContent>
          {ads.map((ad, index) => {
            const inner = (
              <div className="relative w-full aspect-[16/9] md:aspect-video max-h-[560px] group">
                <Image
                  src={ad.imageUrl || DEFAULT_IMAGE_PLACEHOLDER}
                  alt={ad.title || ad.caption || 'Promotional image'}
                  fill
                  className="object-cover"
                  priority={index === 0}
                  unoptimized={ad.imageUrl?.startsWith('data:') || false}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.srcset = '';
                    target.src = DEFAULT_IMAGE_PLACEHOLDER;
                  }}
                />
                {(ad.title || ad.caption) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-3 sm:p-4 pointer-events-none">
                    {ad.title && <p className="font-semibold text-sm sm:text-base">{ad.title}</p>}
                    {ad.caption && (
                      <p className="text-xs sm:text-sm text-white/90 mt-1 line-clamp-2">{ad.caption}</p>
                    )}
                  </div>
                )}
                {ad.linkUrl ? (
                  <div className="absolute inset-0 ring-0 group-hover:ring-2 ring-white/40 transition-shadow" />
                ) : null}
              </div>
            );

            return (
              <CarouselItem key={ad.id}>
                {ad.linkUrl ? (
                  <SlideLink href={ad.linkUrl} className="block h-full w-full cursor-pointer">
                    {inner}
                  </SlideLink>
                ) : (
                  inner
                )}
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 border-none rounded-full h-10 w-10 flex items-center justify-center"
          aria-label="Previous slide"
        />
        <CarouselNext
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 border-none rounded-full h-10 w-10 flex items-center justify-center"
          aria-label="Next slide"
        />
      </Carousel>
      {api && ads.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
          {api.scrollSnapList().map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => api.scrollTo(index)}
              className={cn(
                'h-2 w-2 rounded-full transition-all',
                current === index ? 'w-4 bg-white' : 'bg-white/50 hover:bg-white'
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

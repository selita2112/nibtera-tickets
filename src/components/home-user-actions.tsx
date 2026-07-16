'use client';

import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UserNav } from '@/components/user-nav';
import { useAuth } from '@/context/auth-context';

export default function HomeUserActions() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="outline"
              size="icon"
              className="bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground rounded-full"
            >
              <Link href="/tickets">
                <Ticket className="h-4 w-4" />
                <span className="sr-only">My Tickets</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>My Tickets</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isAuthenticated && !user?.isGuest && <UserNav />}
    </div>
  );
}


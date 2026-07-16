
'use client';

import { MainNav } from '@/components/main-nav';
import { UserNav } from '@/components/user-nav';
import Link from 'next/link';
import Image from 'next/image';
import AuthGuard from '@/components/auth-guard';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

function MainContent({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  return (
    <div
      className={cn(
        'flex flex-col flex-1 overflow-hidden transition-all duration-300 ease-in-out',
        state === 'expanded' ? 'md:ml-64' : 'md:ml-14'
      )}
    >
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 flex-shrink-0">
        <div className="md:hidden">
          <SidebarTrigger className="text-[#8B5E34]" />
        </div>
        <div className="flex-1">{/* Page title would go here if needed */}</div>
        <UserNav />
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          {/* Fixed Sidebar */}
          <Sidebar className="fixed inset-y-0 left-0 z-20 h-full">
            <SidebarContent className="flex flex-col h-full overflow-y-auto">
              <SidebarHeader className="p-4 flex h-16 items-center justify-center border-b border-sidebar-border md:pt-4 pt-8">
                <Link
                  href="/"
                  className="flex items-center gap-2 font-semibold"
                >
                  <Image
                    src="/images/nibtickets.jpg"
                    alt="Nibkera Tickets Logo"
                    width={150}
                    height={40}
                    className="object-contain"
                    data-ai-hint="logo nibtera"
                  />
                </Link>
                <div className="md:hidden ml-auto">
                  <SidebarTrigger className="text-sidebar-foreground hover:text-sidebar-foreground" />
                </div>
              </SidebarHeader>
              <div className="flex-1">
                <MainNav />
              </div>
            </SidebarContent>
          </Sidebar>

          {/* Main Content (scrollable) */}
          <MainContent>{children}</MainContent>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}



import Link from 'next/link';
import Image from 'next/image';

export default function TicketsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    const navbarStyle = { background: '#fefce5' };
  return (
    <>
       <header className="fixed top-0 z-40 w-full" style={navbarStyle}>
        <div className="container flex h-14 items-center space-x-4 sm:justify-between sm:space-x-0">
          <div className="flex gap-6 md:gap-10">
            <Link href="/" className="flex items-center space-x-2">
              <Image src="/images/nibtickets.jpg" alt="NibTera Tickets Logo" width={120} height={28} className="object-contain" data-ai-hint="logo nibtera" />
            </Link>
          </div>
        </div>
      </header>
      <main className="pt-14">{children}</main>
    </>
  );
}

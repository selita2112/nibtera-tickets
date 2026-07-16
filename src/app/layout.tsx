
import type { Metadata } from 'next';
import Image from 'next/image';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/context/auth-context';
import { ConditionalFooter } from '@/components/conditional-footer';
import { headers } from 'next/headers'
import React from 'react';
 
export const metadata: Metadata = {
  title: 'NibTera Tickets',
  description: 'The ultimate solution for event ticketing.',
  icons: {
    icon: '/images/favicon.ico',
  },
};
 
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? ""
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning={true}>
        <AuthProvider>
            <div className="flex flex-col min-h-screen relative">
              <main className="flex-1 bg-background">
                {children}
              </main>
              <ConditionalFooter />
            </div>
            <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}

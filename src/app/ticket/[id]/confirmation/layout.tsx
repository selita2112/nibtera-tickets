
import React from 'react';

export default function TicketConfirmationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

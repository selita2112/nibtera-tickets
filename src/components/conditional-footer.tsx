'use client';

import { usePathname } from 'next/navigation';

export function ConditionalFooter() {
  const pathname = usePathname();
  // We no longer need a conditional footer, as the new design has a footer on the main page.
  // Returning null effectively disables this component.
  return null;
}

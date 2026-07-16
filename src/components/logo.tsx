import { Ticket } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center justify-center h-8 w-8 bg-primary rounded-md">
      <Ticket className="h-5 w-5 text-primary-foreground" />
    </div>
  );
}

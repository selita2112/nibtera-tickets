

'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, MinusCircle, PlusCircle, ShoppingCart, X } from "lucide-react";
import type { SelectedTicket } from "@/app/events/[id]/page";
import type { PromoCode } from "@prisma/client";

interface CartSheetProps {
  children: React.ReactNode;
  selectedTickets: Record<number, SelectedTicket>;
  subtotal: number;
  discount: number;
  total: number;
  totalItems: number;
  promoCode: string;
  setPromoCode: (code: string) => void;
  appliedPromo: PromoCode | null;
  isPromoLoading: boolean;
  handleApplyPromoCode: () => void;
  removePromoCode: () => void;
  updateTicketQuantity: (ticket: SelectedTicket, quantity: number) => void;
  eventColor?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CartSheet({
  children,
  selectedTickets,
  subtotal,
  discount,
  total,
  totalItems,
  promoCode,
  setPromoCode,
  appliedPromo,
  isPromoLoading,
  handleApplyPromoCode,
  removePromoCode,
  updateTicketQuantity,
  open,
  onOpenChange,
}: CartSheetProps) {

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
            <div className="fixed right-4 top-1/2 z-[90] -translate-y-1/2 transition-opacity duration-200 data-[state=open]:pointer-events-none data-[state=open]:opacity-0 sm:right-6">
                <Button className="h-14 w-14 rounded-full shadow-lg" size="icon">
                    <ShoppingCart className="h-6 w-6" />
                    <Badge variant="secondary" className="absolute -top-1 -right-1 h-6 w-6 justify-center rounded-full bg-primary text-primary-foreground">{totalItems}</Badge>
                    <span className="sr-only">View Cart</span>
                </Button>
            </div>
        </SheetTrigger>
        <SheetContent 
          className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col gap-0 bg-card p-0 text-card-foreground sm:max-w-md sm:p-6 sm:gap-4"
        >
            <SheetHeader className="shrink-0 space-y-2 px-6 pb-2 pt-6 text-left sm:px-0 sm:pb-0 sm:pt-0">
                <SheetTitle className="text-card-foreground">Your Cart</SheetTitle>
                <SheetDescription>
                    Review your order and proceed to checkout.
                </SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 px-6 sm:px-0">
                <div className="space-y-4 py-2 pr-3 sm:pr-4">
                {Object.values(selectedTickets).map(ticket => {
                    const remaining = ticket.total - ticket.sold;
                    return (
                        <div key={ticket.id} className="flex items-center gap-4 p-3 rounded-lg bg-secondary">
                            <div className="flex-1">
                                <p className="font-semibold">{ticket.name}</p>
                                <p className="text-sm text-accent font-bold">
                                    {ticket.price.toFixed(2)} ETB
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateTicketQuantity(ticket, Math.max(0, ticket.quantity - 1))} disabled={ticket.quantity === 0}>
                                    <MinusCircle className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center font-bold text-sm">{ticket.quantity}</span>
                                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateTicketQuantity(ticket, Math.min(remaining, ticket.quantity + 1))} disabled={remaining === 0 || ticket.quantity >= remaining}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )
                })}
                </div>
            </ScrollArea>
            <SheetFooter className="mt-auto flex shrink-0 flex-col gap-4 !space-x-0 border-t border-border bg-card px-6 pb-[max(1.75rem,calc(env(safe-area-inset-bottom,0px)+1.25rem))] pt-4 sm:px-0">
                <div className="space-y-2">
                    {/* Subtotal removed — showing Total only to avoid duplicate values */}
                    {appliedPromo && (
                        <div className="text-sm flex justify-between text-green-600 dark:text-green-400">
                            <span>Discount ({appliedPromo.code})</span>
                            <span className="font-medium">-{discount.toFixed(2)} ETB</span>
                        </div>
                    )}
                    <div className="border-t border-border my-2"></div>
                     <div className="text-sm">
                        <div className="text-muted-foreground">Total:</div>
                        <div className="font-normal">{total.toFixed(2)} ETB</div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Promo Code" 
                            value={promoCode}
                            onChange={e => setPromoCode(e.target.value)}
                            className="flex-grow placeholder:text-muted-foreground"
                            disabled={!!appliedPromo}
                        />
                        {appliedPromo ? (
                            <Button onClick={removePromoCode} variant="outline" size="icon">
                                <X className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button onClick={handleApplyPromoCode} disabled={isPromoLoading || !promoCode} variant="secondary">
                                {isPromoLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Apply
                            </Button>
                        )}
                    </div>
                    {children}
                </div>
            </SheetFooter>
        </SheetContent>
    </Sheet>
    </>
  );
}

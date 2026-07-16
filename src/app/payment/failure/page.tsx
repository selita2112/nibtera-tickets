
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { getEventForTransaction } from '@/lib/actions';


function FailureContent() {
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('transaction_id');
    const [eventId, setEventId] = useState<number | null>(null);
    const [countdown, setCountdown] = useState(10);

    useEffect(() => {
      async function fetchEventId() {
        if(transactionId) {
          const id = await getEventForTransaction(transactionId);
          setEventId(id);
        }
      }
      fetchEventId();
    }, [transactionId]);

    useEffect(() => {
        const countdownInterval = setInterval(() => {
            setCountdown(prev => prev > 0 ? prev - 1 : 0);
        }, 1000);

        const redirectTimeout = setTimeout(() => {
            if (eventId) {
                window.location.href = `/events/${eventId}`;
            } else {
                window.location.href = `/`;
            }
        }, 10000);

        return () => {
            clearInterval(countdownInterval);
            clearTimeout(redirectTimeout);
        };
    }, [eventId]);

    return (
        <Card className="shadow-lg border-destructive">
            <CardHeader className="text-center items-center bg-destructive/10 p-8">
                <XCircle className="h-16 w-16 text-destructive mb-4" />
                <CardTitle className="text-3xl">Payment Failed</CardTitle>
                <CardDescription className="text-lg">
                    Unfortunately, we were unable to process your payment.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-6">
                    You will be redirected in {countdown} seconds.
                </p>
                <div className="flex justify-center gap-4">
                    <Button asChild>
                        <Link href={eventId ? `/events/${eventId}` : '/'}>
                            Try Again
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/">Back to Homepage</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}


export default function PaymentFailurePage() {
    return (
        <div className="container mx-auto py-12 max-w-2xl">
            <Suspense fallback={<div>Loading...</div>}>
                <FailureContent />
            </Suspense>
        </div>
    );
}

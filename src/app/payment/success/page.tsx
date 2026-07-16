
'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import api from '@/lib/api';

function SuccessContent() {
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('transaction_id');
    const [status, setStatus] = useState<'polling' | 'opened' | 'error'>('polling');
    const [error, setError] = useState<string | null>(null);
    const [attendeeId, setAttendeeId] = useState<string | null>(null);
    const [popupBlocked, setPopupBlocked] = useState(false);
    const popupAttemptedRef = useRef(false);

    const confirmationPath = attendeeId ? `/ticket/${attendeeId}/confirmation` : null;

    const openConfirmationPage = useCallback(() => {
        if (!confirmationPath || typeof window === 'undefined') {
            return false;
        }

        try {
            if (attendeeId) {
                const storageKey = `confirmation-opened-${attendeeId}`;
                if (!sessionStorage.getItem(storageKey)) {
                    sessionStorage.setItem(storageKey, 'true');
                }
            }
            sessionStorage.setItem('showSuccessToast', 'true');
        } catch (storageError) {
            console.warn('Unable to access sessionStorage while opening confirmation page.', storageError);
        }

        const popup = window.open(confirmationPath, '_blank', 'noopener,noreferrer');
        if (!popup) {
            setPopupBlocked(true);
            return false;
        }

        popup.focus?.();
        setPopupBlocked(false);
        return true;
    }, [attendeeId, confirmationPath]);

    useEffect(() => {
        if (!transactionId) {
            setError("Transaction ID is missing from the URL.");
            setStatus('error');
            return;
        }

        let isCancelled = false;
        let pollCount = 0;
        const maxPolls = 30; // Poll for up to 60 seconds (30 * 2s)

        const poll = async () => {
            if (isCancelled || pollCount >= maxPolls) {
                if (!isCancelled) {
                    setError("Payment confirmation timed out. Please check 'My Tickets' later.");
                    setStatus('error');
                }
                return;
            }
            pollCount++;
            
            try {
                const response = await api.get(`/api/payment/status/${transactionId}`);
                if (response.data.status === 'COMPLETED') {
                    if (response.data.attendeeId) {
                        setAttendeeId(response.data.attendeeId.toString());
                        isCancelled = true; // Stop polling
                    } else {
                        throw new Error("Could not retrieve ticket details after confirmation.");
                    }
                } else {
                    setTimeout(poll, 2000);
                }
            } catch (error) {
                console.error("Polling error", error);
                setTimeout(poll, 2000);
            }
        };

        poll();

        return () => { isCancelled = true; };
    }, [transactionId]);

    // Open popup when attendeeId is available
    useEffect(() => {
        if (attendeeId && !popupAttemptedRef.current && confirmationPath) {
            popupAttemptedRef.current = true;
            const opened = openConfirmationPage();
            if (opened) {
                setStatus('opened');
            } else {
                setStatus('opened'); // Still mark as opened even if blocked, show button
            }
        }
    }, [attendeeId, confirmationPath, openConfirmationPage]);


    if (status === 'error') {
        return (
            <Card className="shadow-lg border-destructive">
                 <CardHeader className="text-center items-center bg-destructive/10 p-8">
                    <CardTitle className="text-3xl text-destructive">Error</CardTitle>
                    <CardDescription className="text-lg">{error}</CardDescription>
                </CardHeader>
                 <CardContent className="p-8 text-center">
                    <Button asChild>
                        <Link href="/">Back to Homepage</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (status === 'opened') {
        return (
            <Card className="shadow-lg">
                <CardHeader className="text-center items-center bg-secondary/30 p-8">
                    <CheckCircle2 className="h-16 w-16 text-green-600 mb-4" />
                    <CardTitle className="text-3xl">Ticket Ready!</CardTitle>
                    <CardDescription className="text-lg">
                        {popupBlocked 
                            ? "Your ticket confirmation is ready. Please allow pop-ups or use the button below to view it."
                            : "We opened your confirmation page in a new window. The SuperApp thank-you page remains here."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-8 text-center space-y-4">
                    {popupBlocked && (
                        <p className="text-muted-foreground text-sm">
                            Pop-ups seem to be blocked. Tap the button below to open your ticket manually.
                        </p>
                    )}
                    {confirmationPath && (
                        <Button onClick={openConfirmationPage} className="w-full" asChild>
                            <Link href={confirmationPath} target="_blank" rel="noopener noreferrer">
                                View Confirmation Page
                            </Link>
                        </Button>
                    )}
                    <Button variant="outline" asChild className="w-full">
                        <Link href="/tickets">Go to My Tickets</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
         <Card className="shadow-lg">
            <CardHeader className="text-center items-center bg-secondary/30 p-8">
                <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
                <CardTitle className="text-3xl">Finalizing Your Ticket...</CardTitle>
                <CardDescription className="text-lg">
                    Please wait a moment while we confirm your payment.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-6">
                    This should only take a few seconds. Do not close this window.
                </p>
            </CardContent>
        </Card>
    );
}

export default function PaymentSuccessPage() {
    return (
        <div className="container mx-auto py-12 max-w-2xl">
            <Suspense fallback={
                 <Card className="shadow-lg">
                    <CardHeader className="text-center items-center bg-secondary/30 p-8">
                        <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
                        <CardTitle className="text-3xl">Loading Payment Details...</CardTitle>
                    </CardHeader>
                </Card>
            }>
                <SuccessContent />
            </Suspense>
        </div>
    );
}

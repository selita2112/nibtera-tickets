
'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

function ProcessingPaymentContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('transaction_id');
    const sessionId = searchParams.get('session_id'); // Legacy support for arifpay

    useEffect(() => {
        const idToUse = transactionId || sessionId;

        if (!idToUse) {
            console.error("No transaction ID or session ID found in URL.");
            router.replace('/payment/failure');
            return;
        }

        let isCancelled = false;
        let pollCount = 0;
        const maxPolls = 15; // 30 seconds total (15 * 2000ms)
        
        const pollStatus = async () => {
            if (isCancelled || pollCount >= maxPolls) {
                if (!isCancelled) {
                    console.log('Polling timeout reached, redirecting to failure page.');
                    router.replace(`/payment/failure?transaction_id=${idToUse}`);
                }
                return;
            }

            pollCount++;

            try {
                const response = await api.get(`/api/payment/status/${idToUse}`);

                if (response.data.status === 'COMPLETED') {
                    if (!isCancelled) {
                        isCancelled = true;
                        // Set a flag for the toast
                        sessionStorage.setItem('showSuccessToast', 'true');
                        // The transaction ID from the response is the internal one we need for confirmation
                        router.replace(`/ticket/confirmation?transaction_id=${response.data.transactionId}`);
                    }
                    return; // Stop polling
                }
            } catch (error: any) {
                 if (error.response?.status === 401 || error.response?.status === 403) {
                    console.error("Unauthorized to check payment status. Stopping poll.");
                    isCancelled = true;
                    router.replace('/payment/failure');
                    return;
                }
                console.error('Error polling payment status:', error);
                // Continue polling on error until max attempts
            }

            // If not completed, schedule the next poll
            if (!isCancelled) {
                setTimeout(pollStatus, 2000);
            }
        };

        // Start the first poll
        pollStatus();

        return () => {
            isCancelled = true;
        };
    }, [router, sessionId, transactionId]);

    return (
        <div className="container mx-auto p-8 max-w-lg">
            <div className="bg-card border rounded-xl p-8 text-center space-y-4">
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                <h1 className="text-2xl font-semibold">Finalizing Your Ticket...</h1>
                <p className="text-muted-foreground">Please wait while we confirm your payment. This should only take a few seconds.</p>
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Do not close this window.</span>
                </div>
            </div>
        </div>
    );
}

export default function ProcessingPaymentPage() {
    return (
        <Suspense fallback={
             <div className="container mx-auto p-8 max-w-lg">
                <div className="bg-card border rounded-xl p-8 text-center space-y-4">
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                    <h1 className="text-2xl font-semibold">Loading...</h1>
                </div>
            </div>
        }>
            <ProcessingPaymentContent />
        </Suspense>
    );
}


'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useToast } from '@/hooks/use-toast';

const QR_REGION_ID = "qr-code-reader-view";

interface QrScannerProps {
    onScanSuccess: (text: string) => void;
    isScanning: boolean;
}

// This component is now deprecated in favor of the implementation directly in the page.
// It is kept here to avoid breaking imports, but it is no longer used.
// The logic has been moved to `src/app/(auth)/dashboard/scan/page.tsx` for better state management.
export default function QrScannerComponent({ onScanSuccess, isScanning }: QrScannerProps) {
    const { toast } = useToast();
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        if (!isScanning) {
            if (html5QrCodeRef.current?.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Failed to stop scanner", err));
            }
            return;
        }

        const newScanner = new Html5Qrcode(QR_REGION_ID);
        html5QrCodeRef.current = newScanner;

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
        };
        
        newScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                onScanSuccess(decodedText);
            },
            (errorMessage) => {
                // This callback is called frequently, so we can ignore most errors.
            })
            .catch(err => {
                console.error("Unable to start QR Code scanner.", err);
                toast({
                    variant: 'destructive',
                    title: 'Camera Error',
                    description: err.message || 'Could not access camera. Please check permissions.'
                });
            });

        return () => {
            if (newScanner && newScanner.isScanning) {
                newScanner.stop().catch(err => {
                    console.error("Error stopping the scanner on cleanup.", err);
                });
            }
        };
    }, [isScanning, onScanSuccess, toast]);

    return <div id={QR_REGION_ID} className="w-full h-full" />;
}

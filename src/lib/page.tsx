

'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, CameraOff } from 'lucide-react';
import { checkInAttendee } from '@/lib/actions';
import type { Attendee, Event as EventType, TicketType } from '@prisma/client';
import { useToast } from '@/hooks/use-toast';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface CheckInResult extends Attendee {
    event: EventType;
    ticketType: TicketType;
}

const QR_REGION_ID = "qr-code-reader-view";

export default function ScanQrPage() {
    const [result, setResult] = useState<{data: CheckInResult | null, error: string | null} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const { toast } = useToast();
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const processScan = async (decodedText: string) => {
        setIsLoading(true);
        setResult(null);
        
        try {
            const ticketCode = decodedText.trim();
            if (!ticketCode) {
                throw new Error("QR code contains invalid data.");
            }

            const checkInResult = await checkInAttendee(ticketCode);

            if (checkInResult.error) {
                setResult({ data: checkInResult.data, error: checkInResult.error });
                toast({ variant: 'destructive', title: 'Check-in Failed', description: checkInResult.error });
            } else if(checkInResult.data) {
                setResult({ data: checkInResult.data, error: null });
                toast({ title: 'Check-in Successful!', description: `${checkInResult.data.name} has been checked in.` });
            }
        } catch (error: any) {
            console.error("Scan processing error:", error);
            const errorMessage = error.message || "Invalid QR code. Please scan a valid NibTera ticket.";
            setResult({ data: null, error: errorMessage });
            toast({ variant: 'destructive', title: 'Scan Error', description: errorMessage });
        } finally {
            setIsLoading(false);
            if (isScanning) {
                stopScanning();
            }
        }
    };
    
    const stopScanning = () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
            html5QrCodeRef.current.stop().then(() => {
                setIsScanning(false);
                html5QrCodeRef.current = null;
            }).catch(err => {
                console.error("Failed to stop scanner", err);
            });
        } else {
            setIsScanning(false);
        }
    };
    
    const startScanning = () => {
        setResult(null);
        if (html5QrCodeRef.current) {
           stopScanning();
        }

        const newScanner = new Html5Qrcode(QR_REGION_ID);
        html5QrCodeRef.current = newScanner;
        setIsScanning(true);

        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        
        newScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText, decodedResult) => {
                // success
                processScan(decodedText);
            },
            (errorMessage) => {
                // parse error, ignore.
            })
            .catch((err) => {
                console.error("Camera start error:", err);
                toast({
                    variant: 'destructive',
                    title: 'Camera Error',
                    description: err.message || 'Could not access camera. Please check permissions and try again.'
                });
                setIsScanning(false);
            });
    };

    const handleStartStopClick = () => {
        if (isScanning) {
            stopScanning();
        } else {
            startScanning();
        }
    }
    
    // Cleanup scanner on component unmount
    useEffect(() => {
        return () => {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Cleanup failed to stop scanner", err));
            }
        };
    }, []);

    const renderResult = () => {
        if (isLoading) {
             return (
                <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>Processing...</AlertTitle>
                    <AlertDescription>Validating ticket, please wait.</AlertDescription>
                </Alert>
            );
        }
        
        if (!result) return null;
        
        if (result.data && !result.error) {
            return (
                <Alert variant="default" className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 dark:text-green-300">Check-in Successful</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-400">
                       <div className="font-semibold text-lg">{result.data.name}</div>
                       <p><span className="font-medium">Event:</span> {result.data.event.name}</p>
                       <p><span className="font-medium">Ticket:</span> {result.data.ticketType.name}</p>
                    </AlertDescription>
                </Alert>
            );
        }

        if (result.error) {
             return (
                 <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Check-in Failed</AlertTitle>
                    <AlertDescription>
                      {result.error}
                      {result.data && (
                         <div className="mt-2 pt-2 border-t border-destructive/20">
                            <p className="font-semibold">{result.data.name}</p>
                            <p><span className="font-medium">Event:</span> {result.data.event.name}</p>
                          </div>
                      )}
                    </AlertDescription>
                </Alert>
             )
        }

        return null;
    }

    return (
        <div className="flex flex-1 flex-col gap-4 md:gap-8 max-w-2xl mx-auto p-4 sm:p-0">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Scan QR Code</h1>
                <p className="text-muted-foreground">
                    Point the camera at an attendee's ticket to check them in.
                </p>
            </div>
            
            <div id="qr-code-image-uploader" style={{ display: 'none' }}></div>

            <Card>
                <CardContent className="p-4 sm:p-6">
                    <div className="w-full aspect-square bg-muted rounded-lg border-dashed border-2 flex items-center justify-center overflow-hidden relative">
                         <div id={QR_REGION_ID} className="w-full h-full" />
                         {!isScanning && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-muted-foreground p-4 bg-muted">
                                <CameraOff className="mx-auto h-12 w-12" />
                                <p className="mt-2">Camera is off. Press "Start Camera" to begin.</p>
                            </div>
                         )}
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4 mt-4">
                        <Button onClick={handleStartStopClick} variant={isScanning ? "destructive" : "default"} className="w-full">
                             {isScanning ? 'Stop Scanning' : 'Start Camera'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {renderResult()}
            
        </div>
    );
}



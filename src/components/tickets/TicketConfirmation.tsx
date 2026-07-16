'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { CheckCircle2, Download, Calendar, MapPin, Ticket as TicketIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTicketDetailsForConfirmation } from '@/lib/actions';
import type { Attendee, Event, TicketType } from '@prisma/client';
import Link from 'next/link';

interface TicketDetails extends Attendee {
	event: Event;
	ticketType: TicketType;
}

function formatEventDate(startDate: Date, endDate: Date | null | undefined): string {
	if (endDate) {
		return `${''}${format(new Date(startDate), 'LLL dd, y')} - ${format(new Date(endDate), 'LLL dd, y')}`;
	}
	return format(new Date(startDate), 'LLL dd, y');
}

export default function TicketConfirmation() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const transactionId = searchParams.get('transaction_id') || searchParams.get('session_id');
	const attendeeIdFromUrl = searchParams.get('attendee_id');

	const [ticket, setTicket] = useState<TicketDetails | null>(null);
	const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const identifier = transactionId || attendeeIdFromUrl;
		if (!identifier) {
			setError('Transaction or ticket identifier is missing from the URL.');
			setLoading(false);
			return;
		}

		let isCancelled = false;
		let timeoutId: any;

		const attemptLoad = async () => {
			if (isCancelled) return;
			try {
				const ticketDetails = await getTicketDetailsForConfirmation(identifier);
				if (!ticketDetails) {
					// Not ready yet; keep polling
					timeoutId = setTimeout(attemptLoad, 2000);
					return;
				}
				setTicket(ticketDetails);

				// Generate QR from the paid ticket id (scanner expects attendee id)
				const qrCodeData = ticketDetails.qrCode || ticketDetails.id.toString();
				const dataUrl = await QRCode.toDataURL(qrCodeData, { errorCorrectionLevel: 'H', type: 'image/png', margin: 1 });
				setQrCodeDataUrl(dataUrl);
				setLoading(false);
			} catch (_err) {
				// Keep polling until backend finishes creating the attendee on COMPLETED
				timeoutId = setTimeout(attemptLoad, 2000);
			}
		};

		attemptLoad();

		return () => {
			isCancelled = true;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [transactionId, attendeeIdFromUrl]);

	const handleDownload = () => {
		if (!qrCodeDataUrl || !ticket) return;
		const link = document.createElement('a');
		link.href = qrCodeDataUrl;
		link.download = `ticket-qr-${ticket.event.name.replace(/\s+/g, '_')}-${ticket.id}.png`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<Card className="shadow-lg">
					<CardHeader className="text-center items-center bg-secondary/30 p-8">
						<Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
						<CardTitle className="text-3xl">Finalizing Your Ticket...</CardTitle>
						<CardDescription className="text-lg">Please wait a moment while we generate your ticket.</CardDescription>
					</CardHeader>
					<CardContent className="p-8 text-center">
						<p className="text-muted-foreground mb-6">This should only take a few seconds.</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
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
			</div>
		);
	}

	if (!ticket) {
		return null;
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-background">
			<Card className="shadow-lg w-full max-w-2xl">
				<CardHeader className="text-center items-center bg-green-50 dark:bg-green-900/10 p-8">
					<CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
					<CardTitle className="text-3xl">Thank You!</CardTitle>
					<CardDescription className="text-lg">Your ticket is confirmed.</CardDescription>
				</CardHeader>
				<CardContent className="p-8">
					<div className="flex flex-col items-center space-y-6">
						<p className="text-center text-muted-foreground">Present this QR code at the event entrance for scanning.</p>
						<div className="p-4 border-4 border-muted rounded-lg bg-white">
							{qrCodeDataUrl && <img src={qrCodeDataUrl} alt="Ticket QR Code" className="h-64 w-64" />}
						</div>
						<Button onClick={handleDownload}>
							<Download className="mr-2 h-4 w-4" />
							Download QR Code
						</Button>
					</div>

					<div className="border-t my-8"></div>

					<div className="space-y-4">
						<h3 className="text-2xl font-semibold">{ticket.event.name}</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-muted-foreground">
							<div className="flex items-start gap-3">
								<TicketIcon className="h-5 w-5 mt-1 text-primary" />
								<div>
									<span className="font-semibold text-foreground">{ticket.ticketType.name}</span>
									<p>Attendee: {ticket.name}</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<Calendar className="h-5 w-5 mt-1 text-primary" />
								<div>
									<span className="font-semibold text-foreground">{formatEventDate(ticket.event.startDate, ticket.event.endDate)}</span>
									<p>Date of Purchase: {format(new Date(ticket.createdAt), 'LLL dd, y')}</p>
								</div>
							</div>
							<div className="flex items-start gap-3 col-span-full">
								<MapPin className="h-5 w-5 mt-1 text-primary" />
								<div>
									<span className="font-semibold text-foreground">{ticket.event.location}</span>
								</div>
							</div>
						</div>
					</div>
					<div className="border-t my-8"></div>
					<div className="flex justify-center gap-4">
						<Button asChild variant="outline">
							<Link href="/">Back to All Events</Link>
						</Button>
						<Button asChild>
							<Link href="/tickets">Go to My Tickets</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}



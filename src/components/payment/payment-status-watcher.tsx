'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function PaymentStatusWatcher() {
	const router = useRouter();

	useEffect(() => {
		let isCancelled = false;
		let timeoutId: any;

		const poll = async () => {
			if (isCancelled) return;
			try {
				const res = await api.get('/api/payment/status/by-session');
				if (res.data?.status === 'COMPLETED') {
					isCancelled = true;
					const attendeeId = res.data?.attendeeId;
					if (attendeeId) {
						router.replace(`/ticket/${attendeeId}/confirmation`);
					} else {
						router.replace(`/payment/success?transaction_id=${res.data?.transactionId ?? ''}`);
					}
					return;
				}
			} catch (_e) {
				// ignore and continue polling
			}
			if (!isCancelled) {
				timeoutId = setTimeout(poll, 2000);
			}
		};

		poll();

		return () => {
			isCancelled = true;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [router]);

	return null;
}



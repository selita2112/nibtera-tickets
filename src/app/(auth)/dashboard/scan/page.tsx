
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import ScanQrPageContent from './page-content';

export default async function ScanQrPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!hasPermission(user.role, 'Scan QR:Access')) {
    redirect('/dashboard');
  }

  return <ScanQrPageContent />;
}

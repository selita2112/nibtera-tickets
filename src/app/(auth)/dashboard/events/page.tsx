
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import ManageEventsPageContent from './page-content';

export default async function ManageEventsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const canAccess = ['Events:Read', 'Events:Update', 'Events:Delete'].some(p => hasPermission(user.role, p));

  if (!canAccess) {
    redirect('/dashboard');
  }

  return <ManageEventsPageContent />;
}

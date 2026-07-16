
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import ReportsPageContent from './page-content';

export default async function ReportsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!hasPermission(user.role, 'Reports:Access')) {
    redirect('/dashboard');
  }

  return <ReportsPageContent />;
}

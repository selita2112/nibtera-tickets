
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import DashboardPageContent from './page-content';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!hasPermission(user.role, 'Dashboard:Access')) {
    // This is the root page of the dashboard, if they don't have access here,
    // they shouldn't be in the dashboard at all.
    // A more robust solution might redirect to a "no access" page or logout.
    // For now, redirecting to profile is a safe default.
    redirect('/profile');
  }

  return <DashboardPageContent />;
}

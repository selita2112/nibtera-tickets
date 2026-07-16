
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import StaffPageContent from './page-content';

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!hasPermission(user.role, 'Staff Management:Access')) {
    redirect('/dashboard/settings');
  }

  return <StaffPageContent />;
}

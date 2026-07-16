
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import RolesPageContent from './page-content';

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const canAccess = ['Role Management:Read', 'Role Management:Create', 'Role Management:Update', 'Role Management:Delete'].some(p =>
    hasPermission(user.role, p)
  );
  if (!canAccess) {
    redirect('/dashboard/settings');
  }

  return <RolesPageContent />;
}

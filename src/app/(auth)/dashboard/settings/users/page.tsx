

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import UserManagementPage from './page-content';

export default async function UserManagementRootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }
  
  const canAccess = ['User Management:Read', 'User Management:Update', 'User Management:Delete'].some(p => hasPermission(user.role, p));

  if (!canAccess) {
    redirect('/dashboard/settings');
  }

  return <UserManagementPage />;
}

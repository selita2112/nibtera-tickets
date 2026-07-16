
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import CreateRolePageContent from './page-content';

export default async function CreateRolePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!hasPermission(user.role, 'Role Management:Create')) {
    redirect('/dashboard/settings/roles');
  }

  return <CreateRolePageContent />;
}

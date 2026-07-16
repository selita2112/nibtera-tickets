
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import EditRolePageContent from './page-content';

export default async function EditRolePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!hasPermission(user.role, 'Role Management:Update')) {
    redirect('/dashboard/settings/roles');
  }

  return <EditRolePageContent />;
}

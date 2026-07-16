
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import EditRoleLegacyPageContent from './page-content';

export default async function EditRoleLegacyPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!hasPermission(user.role, 'Role Management:Update')) {
    redirect('/dashboard/settings/roles');
  }

  return <EditRoleLegacyPageContent />;
}

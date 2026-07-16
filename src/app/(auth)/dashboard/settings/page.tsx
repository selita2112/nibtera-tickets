
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import SettingsPageContent from './page-content';

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const canViewSettings = [
    'User Management:Create',
    'User Management:Read',
    'User Management:Update',
    'User Management:Delete',
    'Role Management:Read',
    'Staff Management:Access'
  ].some(p => hasPermission(user.role, p));

  if (!canViewSettings) {
    redirect('/dashboard');
  }

  return <SettingsPageContent />;
}

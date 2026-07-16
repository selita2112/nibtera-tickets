
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import UserRegistrationPageContent from './page-content';

export default async function UserRegistrationPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  // Creation of non-staff users is Admin-only (server-side invariant in `addUser`).
  if (user.role.name !== 'Admin' || !hasPermission(user.role, 'User Management:Create')) {
    redirect('/dashboard/settings');
  }

  return <UserRegistrationPageContent />;
}

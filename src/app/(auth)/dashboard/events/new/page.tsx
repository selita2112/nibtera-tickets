
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import CreateEventPageContent from './page-content';

export default async function CreateEventPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!hasPermission(user.role, 'Events:Create')) {
    redirect('/dashboard');
  }

  return <CreateEventPageContent />;
}

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import HomeAdsSettingsPageContent from './page-content';

export default async function HomeAdsSettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role.name !== 'Admin') {
    redirect('/dashboard/settings');
  }

  return <HomeAdsSettingsPageContent />;
}

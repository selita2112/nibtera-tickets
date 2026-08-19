import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { getAuditLogs } from '@/lib/actions';
import AuditLogsPageContent from './page-content';

export default async function AuditLogsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!hasPermission(user.role, 'Audit Logs:Access')) {
    redirect('/dashboard');
  }

  const [transactionLogs, otherLogs] = await Promise.all([
    getAuditLogs({ category: 'transactions' }),
    getAuditLogs({ category: 'other' }),
  ]);

  return (
    <AuditLogsPageContent
      transactionLogs={transactionLogs}
      otherLogs={otherLogs}
    />
  );
}
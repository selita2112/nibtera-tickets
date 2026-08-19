'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileClock } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
type AuditLogEntry = {
  id: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  status: string;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'SUCCESS' ? 'default' : 'destructive'}>
      {status}
    </Badge>
  );
}

function TransactionsTable({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Ticket Type</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Order / Ref</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No transactions logged yet.
            </TableCell>
          </TableRow>
        )}
        {logs.map((log) => {
          const ticketTypeName =
            log.details?.ticketType ??
            (Array.isArray(log.details?.tickets)
              ? log.details.tickets.map((t: any) => t.name).join(', ')
              : null) ??
            '-';
          const amount = log.details?.amount;
          const isFree = log.details?.free === true || !amount || Number(amount) === 0;

          return (
            <TableRow key={log.id}>
              <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
              <TableCell>{log.userName ?? 'System'}{log.userRole ? ` (${log.userRole})` : ''}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>{ticketTypeName}</TableCell>
              <TableCell>{isFree ? 'Free' : amount}</TableCell>
              <TableCell>{log.details?.orderNo ?? log.details?.transactionId ?? log.entityId ?? '-'}</TableCell>
              <TableCell><StatusBadge status={log.status} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function OtherActionsTable({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              No actions logged yet.
            </TableCell>
          </TableRow>
        )}
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
            <TableCell>{log.userName ?? 'System'}{log.userRole ? ` (${log.userRole})` : ''}</TableCell>
            <TableCell>{log.action}</TableCell>
            <TableCell>{log.entityType ?? '-'} {log.entityId ? `#${log.entityId}` : ''}</TableCell>
            <TableCell><StatusBadge status={log.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AuditLogsPageContent({
  transactionLogs,
  otherLogs,
}: {
  transactionLogs: AuditLogEntry[];
  otherLogs: AuditLogEntry[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-8">
      <div>
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <FileClock className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            A record of every action taken in the system, for accountability and troubleshooting.
          </p>
        </div>
      </div>

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">
            Transactions ({transactionLogs.length})
          </TabsTrigger>
          <TabsTrigger value="other">
            Other Actions ({otherLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Payments &amp; Purchases</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionsTable logs={transactionLogs} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="other">
          <Card>
            <CardHeader>
              <CardTitle>System Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <OtherActionsTable logs={otherLogs} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
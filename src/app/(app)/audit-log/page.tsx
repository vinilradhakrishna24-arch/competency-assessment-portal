import { PageHeader } from '@/components/ui/page-header';
import { AuditLogViewer } from '@/components/audit/audit-log-viewer';
import { getAuditLogs, getDistinctAuditActions } from '@/lib/actions/audit';
import { requireAdmin } from '@/lib/auth/session';

export default async function AuditLogPage() {
  await requireAdmin();
  const [logs, actions] = await Promise.all([getAuditLogs(), getDistinctAuditActions()]);

  return (
    <div>
      <PageHeader title="Audit Log" description="A complete, tamper-evident trail of every significant action taken in the portal." />
      <AuditLogViewer initialLogs={logs} actions={actions} />
    </div>
  );
}

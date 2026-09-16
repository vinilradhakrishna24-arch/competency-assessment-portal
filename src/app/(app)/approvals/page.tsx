import { PageHeader } from '@/components/ui/page-header';
import { ApprovalsTable } from '@/components/approvals/approvals-table';
import { getPendingApprovals } from '@/lib/actions/approvals';
import { requireAdmin } from '@/lib/auth/session';

export default async function ApprovalsPage() {
  await requireAdmin();
  const rows = await getPendingApprovals();

  return (
    <div>
      <PageHeader
        title="Pending Approval"
        description="HSE results awaiting management sign-off before a certificate is issued."
      />
      <ApprovalsTable initialRows={rows as never} />
    </div>
  );
}

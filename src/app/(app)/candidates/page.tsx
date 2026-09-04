import { PageHeader } from '@/components/ui/page-header';
import { CandidatesTable } from '@/components/candidates/candidates-table';
import { getCandidates } from '@/lib/actions/candidates';
import { requireUser } from '@/lib/auth/session';

export default async function CandidatesPage() {
  const [user, candidates] = await Promise.all([requireUser(), getCandidates()]);

  return (
    <div>
      <PageHeader title="Candidates" description="Manage the master list of engineers assessed through the portal." />
      <CandidatesTable initialCandidates={candidates} role={user.role} />
    </div>
  );
}

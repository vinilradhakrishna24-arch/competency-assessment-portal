import { PageHeader } from '@/components/ui/page-header';
import { UsersTable } from '@/components/users/users-table';
import { getUsers } from '@/lib/actions/users';
import { requireAdmin } from '@/lib/auth/session';

export default async function UsersPage() {
  const [currentUser, users] = await Promise.all([requireAdmin(), getUsers()]);

  return (
    <div>
      <PageHeader title="Users & Roles" description="Manage who can access the portal as an Admin/Examiner or Viewer." />
      <UsersTable initialUsers={users as never} currentUserId={currentUser.id} />
    </div>
  );
}

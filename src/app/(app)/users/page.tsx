import { PageHeader } from '@/components/ui/page-header';
import { UsersTable } from '@/components/users/users-table';
import { getUsers, getRoles } from '@/lib/actions/users';
import { requireAdmin } from '@/lib/auth/session';

export default async function UsersPage() {
  const [currentUser, users, roles] = await Promise.all([requireAdmin(), getUsers(), getRoles()]);

  return (
    <div>
      <PageHeader title="Users & Roles" description="Manage who can access the portal, and with which role." />
      <UsersTable initialUsers={users as never} roles={roles} currentUserId={currentUser.id} />
    </div>
  );
}

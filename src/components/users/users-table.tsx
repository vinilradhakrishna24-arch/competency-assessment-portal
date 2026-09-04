'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, UserCog, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FormField, Input, Select } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getUsers, createUser, changeUserRole, setUserActive, deleteUser } from '@/lib/actions/users';
import type { RoleName } from '@/types/database';

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  roles: { name: RoleName } | { name: RoleName }[] | null;
}

function roleOf(row: UserRow): RoleName {
  const r = row.roles;
  return (Array.isArray(r) ? r[0]?.name : r?.name) ?? 'viewer';
}

export function UsersTable({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: string }) {
  const [users, setUsers] = React.useState(initialUsers);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState({ full_name: '', email: '', role: 'viewer' as RoleName, password: '' });
  const [deleting, setDeleting] = React.useState<UserRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  async function refresh() {
    const data = await getUsers();
    setUsers(data as unknown as UserRow[]);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const result = await createUser(form);
    setSaving(false);

    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.error) toast.error(result.error);
      return;
    }

    toast.success('User created');
    setInviteOpen(false);
    setForm({ full_name: '', email: '', role: 'viewer', password: '' });
    refresh();
  }

  async function handleRoleChange(userId: string, role: RoleName) {
    const result = await changeUserRole(userId, role);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to change role');
      return;
    }
    toast.success('Role updated');
    refresh();
  }

  async function handleToggleActive(userId: string, active: boolean) {
    const result = await setUserActive(userId, active);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to update user');
      return;
    }
    toast.success(active ? 'User activated' : 'User deactivated');
    refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const result = await deleteUser(deleting.id);
    setDeleteBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to delete user');
      return;
    }
    toast.success('User deleted');
    setDeleting(null);
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th />
          </Tr>
        </Thead>
        <Tbody>
          {users.map((u) => {
            const role = roleOf(u);
            const isSelf = u.id === currentUserId;
            return (
              <Tr key={u.id}>
                <Td className="font-medium text-slate-900">
                  {u.full_name} {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                </Td>
                <Td className="text-slate-500">{u.email}</Td>
                <Td>
                  <Select
                    className="w-auto"
                    value={role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as RoleName)}
                    disabled={isSelf}
                  >
                    <option value="admin">Admin / Examiner</option>
                    <option value="viewer">Viewer / Management</option>
                  </Select>
                </Td>
                <Td>
                  <Badge className={u.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}>
                    {u.active ? 'Active' : 'Inactive'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSelf}
                      onClick={() => handleToggleActive(u.id, !u.active)}
                    >
                      {u.active ? (
                        <>
                          <ShieldOff className="h-3.5 w-3.5" /> Deactivate
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" /> Activate
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={isSelf} onClick={() => setDeleting(u)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen} title="Add User" className="w-[min(28rem,92vw)]">
        <form onSubmit={handleInvite} className="space-y-4">
          <FormField label="Full Name" htmlFor="u_full_name" required error={errors.full_name}>
            <Input id="u_full_name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
          </FormField>
          <FormField label="Email" htmlFor="u_email" required error={errors.email}>
            <Input id="u_email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </FormField>
          <FormField label="Role" htmlFor="u_role" required>
            <Select id="u_role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as RoleName }))}>
              <option value="admin">Admin / Examiner</option>
              <option value="viewer">Viewer / Management</option>
            </Select>
          </FormField>
          <FormField label="Temporary Password" htmlFor="u_password" required error={errors.password} hint="At least 8 characters. Share this with the user securely.">
            <Input id="u_password" type="text" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <UserCog className="h-4 w-4" /> {saving ? 'Creating…' : 'Create User'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete User?"
        description={
          deleting
            ? `You're about to permanently remove ${deleting.full_name} (${deleting.email}) from the portal. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
}

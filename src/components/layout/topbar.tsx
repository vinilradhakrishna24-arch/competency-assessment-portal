import { LogOut } from 'lucide-react';
import { signOutAction } from '@/lib/auth/actions';
import { Badge } from '@/components/ui/badge';
import type { CurrentUser } from '@/lib/auth/session';

export function Topbar({ user }: { user: CurrentUser }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge className="border-slate-200 bg-slate-50 text-slate-600 capitalize">
          {user.role === 'admin' ? 'Admin / Examiner' : 'Viewer / Management'}
        </Badge>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}

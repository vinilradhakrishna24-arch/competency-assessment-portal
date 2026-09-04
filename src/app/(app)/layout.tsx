import { Toaster } from 'sonner';
import { requireUser } from '@/lib/auth/session';
import { getBranding } from '@/lib/branding';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, branding] = await Promise.all([requireUser(), getBranding()]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={user.role} portalName={branding.portal_name} logoUrl={branding.logo_url} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-400 sm:px-6">
          &copy; {new Date().getFullYear()} {branding.company_name} &middot; {branding.portal_name}
        </footer>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}

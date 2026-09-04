import { Suspense } from 'react';
import { getBranding } from '@/lib/branding';
import { LoginForm } from '@/components/auth/login-form';

export default async function LoginPage() {
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Suspense>
        <LoginForm portalName={branding.portal_name} logoUrl={branding.logo_url} />
      </Suspense>
    </div>
  );
}

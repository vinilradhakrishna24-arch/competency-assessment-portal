'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';

export function LoginForm({ portalName, logoUrl }: { portalName: string; logoUrl: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
      return;
    }

    const next = searchParams.get('next') || '/dashboard';
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mb-4 h-14 w-auto max-w-[220px] object-contain" />
        ) : (
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy-900 text-white">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <h1 className="text-lg font-semibold text-slate-900">{portalName}</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to the examiner dashboard</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label="Email address" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
          />
        </FormField>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        Internal Admin / Examiner and Viewer access only. Candidates use the exam link provided by
        your examiner.
      </p>
    </div>
  );
}

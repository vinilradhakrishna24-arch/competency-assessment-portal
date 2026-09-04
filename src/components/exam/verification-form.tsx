'use client';

import * as React from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, FormField } from '@/components/ui/input';

export function VerificationForm({
  portalName,
  logoUrl,
  onVerify,
}: {
  portalName: string;
  logoUrl: string | null;
  onVerify: (employeeId: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [employeeId, setEmployeeId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onVerify(employeeId);
    if (!result.ok) {
      setError(result.message ?? 'Unable to verify this assessment. Please check your details or contact the examiner.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mb-3 h-12 w-12 rounded-xl object-contain" />
          ) : (
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy-900 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
          )}
          <h1 className="text-base font-semibold text-slate-900">{portalName}</h1>
          <p className="mt-1 text-sm text-slate-500">Candidate Verification</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField label="Employee ID" htmlFor="employee_id" required>
            <Input
              id="employee_id"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoFocus
              required
              aria-invalid={!!error}
              placeholder="Enter your Employee ID"
            />
          </FormField>

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading || !employeeId.trim()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </>
            ) : (
              'VERIFY'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

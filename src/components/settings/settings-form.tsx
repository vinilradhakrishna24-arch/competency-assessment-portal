'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea } from '@/components/ui/input';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { updateBranding, updateOperationalSettings } from '@/lib/actions/settings';
import { updateCompetency } from '@/lib/actions/taxonomy';
import type { Competency, SystemSettingBranding } from '@/types/database';

export function SettingsForm({
  branding,
  defaultPassMark,
  defaultDurations,
  tokenExpiryHours,
  randomization,
  verificationRetry,
  competencies,
}: {
  branding: SystemSettingBranding;
  defaultPassMark: number;
  defaultDurations: number[];
  tokenExpiryHours: number;
  randomization: { randomize_questions: boolean; randomize_options: boolean };
  verificationRetry: { max_attempts: number; window_minutes: number; lock_minutes: number };
  competencies: Competency[];
}) {
  return (
    <div className="space-y-6">
      <BrandingSection branding={branding} />
      <OperationalSection
        defaultPassMark={defaultPassMark}
        defaultDurations={defaultDurations}
        tokenExpiryHours={tokenExpiryHours}
        randomization={randomization}
        verificationRetry={verificationRetry}
      />
      <CompetencyPassMarksSection competencies={competencies} />
    </div>
  );
}

function BrandingSection({ branding }: { branding: SystemSettingBranding }) {
  const [form, setForm] = React.useState(branding);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function setField<K extends keyof SystemSettingBranding>(key: K, value: SystemSettingBranding[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setErrors({});
    const result = await updateBranding({ ...form, logo_url: form.logo_url ?? '' });
    setSaving(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.error) toast.error(result.error);
      return;
    }
    toast.success('Branding updated');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Shown across the portal, on certificates, and on the public verification page.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Company Name (English)" htmlFor="s_company_name" required error={errors.company_name}>
          <Input id="s_company_name" value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} />
        </FormField>
        <FormField label="Company Name (Arabic)" htmlFor="s_company_name_ar" error={errors.company_name_ar}>
          <Input
            id="s_company_name_ar"
            dir="rtl"
            value={form.company_name_ar ?? ''}
            onChange={(e) => setField('company_name_ar', e.target.value)}
          />
        </FormField>
        <FormField label="Portal Name" htmlFor="s_portal_name" required error={errors.portal_name}>
          <Input id="s_portal_name" value={form.portal_name} onChange={(e) => setField('portal_name', e.target.value)} />
        </FormField>
        <FormField label="Certificate Number Prefix" htmlFor="s_prefix" required hint="e.g. SUTC → SUTC/PTW/2026/00128" error={errors.company_prefix}>
          <Input id="s_prefix" value={form.company_prefix} onChange={(e) => setField('company_prefix', e.target.value)} />
        </FormField>
        <FormField label="Logo URL" htmlFor="s_logo" error={errors.logo_url}>
          <Input id="s_logo" value={form.logo_url ?? ''} onChange={(e) => setField('logo_url', e.target.value)} placeholder="https://…" />
        </FormField>
        <FormField label="Primary Accent Color" htmlFor="s_primary">
          <Input id="s_primary" type="text" value={form.primary_accent} onChange={(e) => setField('primary_accent', e.target.value)} />
        </FormField>
        <FormField label="Secondary Accent Color" htmlFor="s_secondary">
          <Input id="s_secondary" type="text" value={form.secondary_accent} onChange={(e) => setField('secondary_accent', e.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Certificate Footer Text" htmlFor="s_footer">
            <Textarea id="s_footer" rows={2} value={form.certificate_footer} onChange={(e) => setField('certificate_footer', e.target.value)} />
          </FormField>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Branding'}
        </Button>
      </CardFooter>
    </Card>
  );
}

function OperationalSection({
  defaultPassMark,
  defaultDurations,
  tokenExpiryHours,
  randomization,
  verificationRetry,
}: {
  defaultPassMark: number;
  defaultDurations: number[];
  tokenExpiryHours: number;
  randomization: { randomize_questions: boolean; randomize_options: boolean };
  verificationRetry: { max_attempts: number; window_minutes: number; lock_minutes: number };
}) {
  const [passMark, setPassMark] = React.useState(defaultPassMark);
  const [durations, setDurations] = React.useState(defaultDurations.join(', '));
  const [expiryHours, setExpiryHours] = React.useState(tokenExpiryHours);
  const [random, setRandom] = React.useState(randomization);
  const [retry, setRetry] = React.useState(verificationRetry);
  const [saving, setSaving] = React.useState<string | null>(null);

  async function save(key: Parameters<typeof updateOperationalSettings>[0], value: Record<string, unknown>, label: string) {
    setSaving(key);
    const result = await updateOperationalSettings(key, value);
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error ?? `Failed to update ${label}`);
      return;
    }
    toast.success(`${label} updated`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operational Defaults</CardTitle>
        <CardDescription>
          These are the fallback values used when creating a new assessment — every value can still be overridden
          per-assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <FormField label="Default Pass Mark (%)" htmlFor="op_pass_mark" hint="Applies to newly created competencies only — existing competencies keep their own pass mark.">
            <Input id="op_pass_mark" type="number" min={1} max={100} step={0.01} value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} />
          </FormField>
          <Button variant="outline" disabled={saving === 'default_pass_mark'} onClick={() => save('default_pass_mark', { value: passMark }, 'Default pass mark')}>
            {saving === 'default_pass_mark' ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <FormField label="Quick Duration Options (minutes)" htmlFor="op_durations" hint="Comma-separated, shown as quick-pick buttons on Create Assessment.">
            <Input id="op_durations" value={durations} onChange={(e) => setDurations(e.target.value)} placeholder="15, 20, 30, 45" />
          </FormField>
          <Button
            variant="outline"
            disabled={saving === 'default_durations_minutes'}
            onClick={() => {
              const options = durations
                .split(',')
                .map((v) => Number(v.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
              save('default_durations_minutes', { options }, 'Duration options');
            }}
          >
            {saving === 'default_durations_minutes' ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <FormField label="Default Link Expiry (hours)" htmlFor="op_expiry" hint="How long a newly generated exam link stays valid before it's started.">
            <Input id="op_expiry" type="number" min={1} value={expiryHours} onChange={(e) => setExpiryHours(Number(e.target.value))} />
          </FormField>
          <Button
            variant="outline"
            disabled={saving === 'token_expiry_defaults'}
            onClick={() => save('token_expiry_defaults', { default_hours: expiryHours }, 'Link expiry default')}
          >
            {saving === 'token_expiry_defaults' ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700">Randomization Defaults</p>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={random.randomize_questions}
              onChange={(e) => setRandom((p) => ({ ...p, randomize_questions: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Randomize question order by default
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={random.randomize_options}
              onChange={(e) => setRandom((p) => ({ ...p, randomize_options: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Randomize answer option order by default
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={saving === 'randomization_defaults'}
            onClick={() => save('randomization_defaults', random, 'Randomization defaults')}
          >
            {saving === 'randomization_defaults' ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700">Employee ID Verification Rate Limiting</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Max Attempts" htmlFor="rt_attempts">
              <Input id="rt_attempts" type="number" min={1} value={retry.max_attempts} onChange={(e) => setRetry((p) => ({ ...p, max_attempts: Number(e.target.value) }))} />
            </FormField>
            <FormField label="Window (minutes)" htmlFor="rt_window">
              <Input id="rt_window" type="number" min={1} value={retry.window_minutes} onChange={(e) => setRetry((p) => ({ ...p, window_minutes: Number(e.target.value) }))} />
            </FormField>
            <FormField label="Lockout (minutes)" htmlFor="rt_lock">
              <Input id="rt_lock" type="number" min={1} value={retry.lock_minutes} onChange={(e) => setRetry((p) => ({ ...p, lock_minutes: Number(e.target.value) }))} />
            </FormField>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={saving === 'verification_retry_settings'}
            onClick={() => save('verification_retry_settings', retry, 'Verification retry settings')}
          >
            {saving === 'verification_retry_settings' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CompetencyPassMarksSection({ competencies }: { competencies: Competency[] }) {
  const [values, setValues] = React.useState<Record<string, number>>(
    Object.fromEntries(competencies.map((c) => [c.id, c.pass_mark]))
  );
  const [saving, setSaving] = React.useState<string | null>(null);

  async function handleSave(competency: Competency) {
    setSaving(competency.id);
    const result = await updateCompetency(competency.id, {
      code: competency.code,
      competency_name: competency.competency_name,
      description: competency.description ?? '',
      pass_mark: values[competency.id] ?? competency.pass_mark,
      active: competency.active,
    });
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to update pass mark');
      return;
    }
    toast.success(`${competency.code} pass mark updated`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competency Pass Marks</CardTitle>
        <CardDescription>
          Each competency has its own pass mark — this is the value used to score every assessment for that
          competency. Nothing is hard-coded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {competencies.map((c) => (
          <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <CompetencyBadge code={c.code} name={`${c.code} — ${c.competency_name}`} />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={100}
                step={0.01}
                className="w-28"
                value={values[c.id] ?? c.pass_mark}
                onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
              />
              <span className="text-sm text-slate-500">%</span>
              <Button variant="outline" size="sm" disabled={saving === c.id} onClick={() => handleSave(c)}>
                {saving === c.id ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

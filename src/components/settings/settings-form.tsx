'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, EyeOff, Eye } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Textarea } from '@/components/ui/input';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { updateBranding, updateOperationalSettings } from '@/lib/actions/settings';
import {
  updateCompetency,
  createCompetencyArea,
  updateCompetencyArea,
  setCompetencyAreaActive,
  deleteCompetencyArea,
} from '@/lib/actions/taxonomy';
import type { Competency, CompetencyArea, SystemSettingBranding } from '@/types/database';

export function SettingsForm({
  branding,
  defaultPassMark,
  defaultDurations,
  tokenExpiryHours,
  randomization,
  verificationRetry,
  competencies,
  competencyAreas,
}: {
  branding: SystemSettingBranding;
  defaultPassMark: number;
  defaultDurations: number[];
  tokenExpiryHours: number;
  randomization: { randomize_questions: boolean; randomize_options: boolean };
  verificationRetry: { max_attempts: number; window_minutes: number; lock_minutes: number };
  competencies: Competency[];
  competencyAreas?: CompetencyArea[];
}) {
  const hseCompetencies = competencies.filter((c) => c.stream === 'hse');

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
      {hseCompetencies.length > 0 && (
        <>
          <HseCompetencySettingsSection competencies={hseCompetencies} />
          <CompetencyAreasManager competencies={hseCompetencies} initialAreas={competencyAreas ?? []} />
        </>
      )}
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

/** HSE-only per-competency configuration: RAG amber threshold, certificate
 * validity window, reassessment waiting period, and whether a pass routes
 * through manual approval before a certificate is issued. Every field maps
 * 1:1 to a nullable/defaulted column added in migration 0011 -- nothing
 * here can affect a technical (LOA/SFT/PTW) competency, since this section
 * only ever renders for stream === 'hse' rows. */
function HseCompetencySettingsSection({ competencies }: { competencies: Competency[] }) {
  const [values, setValues] = React.useState<
    Record<string, { amber_threshold: number | null; validity_months: number | null; reassessment_wait_days: number; requires_result_approval: boolean }>
  >(
    Object.fromEntries(
      competencies.map((c) => [
        c.id,
        {
          amber_threshold: c.amber_threshold,
          validity_months: c.validity_months,
          reassessment_wait_days: c.reassessment_wait_days,
          requires_result_approval: c.requires_result_approval,
        },
      ])
    )
  );
  const [saving, setSaving] = React.useState<string | null>(null);

  function setField<K extends 'amber_threshold' | 'validity_months' | 'reassessment_wait_days' | 'requires_result_approval'>(
    id: string,
    key: K,
    value: (typeof values)[string][K]
  ) {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id]!, [key]: value } }));
  }

  async function handleSave(competency: Competency) {
    const v = values[competency.id]!;
    setSaving(competency.id);
    const result = await updateCompetency(competency.id, {
      code: competency.code,
      competency_name: competency.competency_name,
      description: competency.description ?? '',
      pass_mark: competency.pass_mark,
      active: competency.active,
      amber_threshold: v.amber_threshold,
      validity_months: v.validity_months,
      reassessment_wait_days: v.reassessment_wait_days,
      requires_result_approval: v.requires_result_approval,
    });
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to update HSE settings');
      return;
    }
    toast.success(`${competency.code} HSE settings updated`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HSE Competency Settings</CardTitle>
        <CardDescription>
          RAG banding, certificate validity, and the result-approval workflow — configurable per HSE competency.
          Technical competencies (LOA/SFT/PTW) are unaffected and never show this section.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {competencies.map((c) => {
          const v = values[c.id]!;
          return (
            <div key={c.id} className="space-y-3 rounded-xl border border-slate-200 p-3">
              <CompetencyBadge code={c.code} name={`${c.code} — ${c.competency_name}`} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <FormField label="Amber Threshold (%)" htmlFor={`amber_${c.id}`} hint="Below pass mark, above this = Amber.">
                  <Input
                    id={`amber_${c.id}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={v.amber_threshold ?? ''}
                    onChange={(e) => setField(c.id, 'amber_threshold', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Certificate Validity (months)" htmlFor={`validity_${c.id}`} hint="Blank = never expires.">
                  <Input
                    id={`validity_${c.id}`}
                    type="number"
                    min={1}
                    value={v.validity_months ?? ''}
                    onChange={(e) => setField(c.id, 'validity_months', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Reassessment Wait (days)" htmlFor={`wait_${c.id}`}>
                  <Input
                    id={`wait_${c.id}`}
                    type="number"
                    min={0}
                    value={v.reassessment_wait_days}
                    onChange={(e) => setField(c.id, 'reassessment_wait_days', Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Result Approval" htmlFor={`approval_${c.id}`}>
                  <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
                    <input
                      id={`approval_${c.id}`}
                      type="checkbox"
                      checked={v.requires_result_approval}
                      onChange={(e) => setField(c.id, 'requires_result_approval', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Requires manual approval
                  </label>
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" disabled={saving === c.id} onClick={() => handleSave(c)}>
                  {saving === c.id ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** CRUD for competency_areas -- the sub-topics used to tag HSE questions
 * and break assessment scores down by area (e.g. HSE Advisor's ~34
 * areas). Only ever rendered for HSE-stream competencies. */
function CompetencyAreasManager({
  competencies,
  initialAreas,
}: {
  competencies: Competency[];
  initialAreas: CompetencyArea[];
}) {
  const [areas, setAreas] = React.useState(initialAreas);
  const [drafts, setDrafts] = React.useState<Record<string, { code: string; area_name: string; sort_order: string }>>(
    Object.fromEntries(competencies.map((c) => [c.id, { code: '', area_name: '', sort_order: '0' }]))
  );
  const [editing, setEditing] = React.useState<Record<string, { code: string; area_name: string; sort_order: string }>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function areasFor(competencyId: string) {
    return areas.filter((a) => a.competency_id === competencyId).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  }

  async function handleAdd(competency: Competency) {
    const draft = drafts[competency.id]!;
    if (!draft.code.trim() || !draft.area_name.trim()) {
      toast.error('Code and area name are required');
      return;
    }
    setBusyId(`add_${competency.id}`);
    const result = await createCompetencyArea({
      competency_id: competency.id,
      code: draft.code.trim(),
      area_name: draft.area_name.trim(),
      sort_order: Number(draft.sort_order) || 0,
      active: true,
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? 'Failed to add area');
      return;
    }
    toast.success('Area added');
    setDrafts((prev) => ({ ...prev, [competency.id]: { code: '', area_name: '', sort_order: '0' } }));
    // Server action already revalidates the page; refetch by reloading isn't
    // ideal for a form, so optimistically add a placeholder row using what
    // we know -- the next full page load will have the real id-consistent data.
    setAreas((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        competency_id: competency.id,
        code: draft.code.trim(),
        area_name: draft.area_name.trim(),
        sort_order: Number(draft.sort_order) || 0,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  function startEdit(area: CompetencyArea) {
    setEditing((prev) => ({
      ...prev,
      [area.id]: { code: area.code, area_name: area.area_name, sort_order: String(area.sort_order) },
    }));
  }

  async function handleSaveEdit(area: CompetencyArea) {
    const draft = editing[area.id];
    if (!draft) return;
    setBusyId(area.id);
    const result = await updateCompetencyArea(area.id, {
      competency_id: area.competency_id,
      code: draft.code.trim(),
      area_name: draft.area_name.trim(),
      sort_order: Number(draft.sort_order) || 0,
      active: area.active,
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? 'Failed to update area');
      return;
    }
    toast.success('Area updated');
    setAreas((prev) =>
      prev.map((a) => (a.id === area.id ? { ...a, code: draft.code.trim(), area_name: draft.area_name.trim(), sort_order: Number(draft.sort_order) || 0 } : a))
    );
    setEditing((prev) => {
      const next = { ...prev };
      delete next[area.id];
      return next;
    });
  }

  async function handleToggleActive(area: CompetencyArea) {
    setBusyId(area.id);
    const result = await setCompetencyAreaActive(area.id, !area.active);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to update area');
      return;
    }
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, active: !a.active } : a)));
  }

  async function handleDelete(area: CompetencyArea) {
    setBusyId(area.id);
    const result = await deleteCompetencyArea(area.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to delete area');
      return;
    }
    toast.success('Area deleted');
    setAreas((prev) => prev.filter((a) => a.id !== area.id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competency Areas</CardTitle>
        <CardDescription>
          Sub-topics used to tag HSE questions and break assessment scores down by area. Deactivate an area instead
          of deleting it once questions reference it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {competencies.map((c) => {
          const rows = areasFor(c.id);
          const draft = drafts[c.id]!;
          return (
            <div key={c.id} className="space-y-3">
              <CompetencyBadge code={c.code} name={`${c.code} — ${c.competency_name}`} />
              {rows.length > 0 && (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Code</Th>
                      <Th>Area Name</Th>
                      <Th>Order</Th>
                      <Th>Status</Th>
                      <Th />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rows.map((a) => {
                      const isEditing = !!editing[a.id];
                      const edit = editing[a.id];
                      return (
                        <Tr key={a.id}>
                          {isEditing && edit ? (
                            <>
                              <Td>
                                <Input
                                  className="w-24"
                                  value={edit.code}
                                  onChange={(e) => setEditing((prev) => ({ ...prev, [a.id]: { ...edit, code: e.target.value } }))}
                                />
                              </Td>
                              <Td>
                                <Input
                                  value={edit.area_name}
                                  onChange={(e) => setEditing((prev) => ({ ...prev, [a.id]: { ...edit, area_name: e.target.value } }))}
                                />
                              </Td>
                              <Td>
                                <Input
                                  className="w-20"
                                  type="number"
                                  value={edit.sort_order}
                                  onChange={(e) => setEditing((prev) => ({ ...prev, [a.id]: { ...edit, sort_order: e.target.value } }))}
                                />
                              </Td>
                              <Td />
                              <Td>
                                <div className="flex gap-1">
                                  <Button size="sm" disabled={busyId === a.id} onClick={() => handleSaveEdit(a)}>
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setEditing((prev) => {
                                        const next = { ...prev };
                                        delete next[a.id];
                                        return next;
                                      })
                                    }
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </Td>
                            </>
                          ) : (
                            <>
                              <Td className="font-medium text-slate-700">{a.code}</Td>
                              <Td>{a.area_name}</Td>
                              <Td className="text-slate-500">{a.sort_order}</Td>
                              <Td>
                                <span className={a.active ? 'text-emerald-700' : 'text-slate-400'}>
                                  {a.active ? 'Active' : 'Inactive'}
                                </span>
                              </Td>
                              <Td>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => startEdit(a)}>
                                    Edit
                                  </Button>
                                  <Button variant="ghost" size="sm" disabled={busyId === a.id} onClick={() => handleToggleActive(a)}>
                                    {a.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="sm" disabled={busyId === a.id} onClick={() => handleDelete(a)}>
                                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                  </Button>
                                </div>
                              </Td>
                            </>
                          )}
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              )}
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 p-3 sm:flex-row sm:items-end">
                <div className="w-28">
                  <FormField label="Code" htmlFor={`new_code_${c.id}`}>
                    <Input
                      id={`new_code_${c.id}`}
                      value={draft.code}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: { ...draft, code: e.target.value } }))}
                      placeholder="e.g. A01"
                    />
                  </FormField>
                </div>
                <div className="flex-1">
                  <FormField label="Area Name" htmlFor={`new_name_${c.id}`}>
                    <Input
                      id={`new_name_${c.id}`}
                      value={draft.area_name}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: { ...draft, area_name: e.target.value } }))}
                      placeholder="e.g. Risk Assessment"
                    />
                  </FormField>
                </div>
                <div className="w-20">
                  <FormField label="Order" htmlFor={`new_order_${c.id}`}>
                    <Input
                      id={`new_order_${c.id}`}
                      type="number"
                      value={draft.sort_order}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: { ...draft, sort_order: e.target.value } }))}
                    />
                  </FormField>
                </div>
                <Button size="sm" disabled={busyId === `add_${c.id}`} onClick={() => handleAdd(c)}>
                  <Plus className="h-3.5 w-3.5" /> Add Area
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

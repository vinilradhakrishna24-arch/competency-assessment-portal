'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Search, Copy, Check, Link2, RotateCcw, UserPlus, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/input';
import { CompetencyBadge } from '@/components/competency/competency-badge';
import { QUICK_DURATIONS_MINUTES } from '@/lib/constants';
import { formatDuration } from '@/lib/utils';
import { createAssessment } from '@/lib/actions/assessments';
import { getCandidates } from '@/lib/actions/candidates';
import type { Candidate, Competency } from '@/types/database';

interface QuestionSetOption {
  id: string;
  competency_id: string;
  set_name: string;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateAssessmentForm({
  competencies,
  questionSets,
  initialCandidates,
  defaultPassMark,
  tokenExpiryHours,
  defaultRandomizeOptions,
}: {
  competencies: Competency[];
  questionSets: QuestionSetOption[];
  initialCandidates: Candidate[];
  defaultPassMark: number;
  tokenExpiryHours: number;
  defaultRandomizeOptions: boolean;
}) {
  const [candidateMode, setCandidateMode] = React.useState<'existing' | 'new'>('existing');
  const [candidateSearch, setCandidateSearch] = React.useState('');
  const [candidateResults, setCandidateResults] = React.useState<Candidate[]>(initialCandidates);
  const [selectedCandidate, setSelectedCandidate] = React.useState<Candidate | null>(null);
  const [newCandidate, setNewCandidate] = React.useState({
    employee_id: '',
    full_name: '',
    designation: '',
    email: '',
    mobile: '',
    project_contract: '',
    department: '',
  });

  const [competencyId, setCompetencyId] = React.useState(competencies[0]?.id ?? '');
  const [questionSource, setQuestionSource] = React.useState<'specific_set' | 'random'>('specific_set');
  const [questionSetId, setQuestionSetId] = React.useState('');
  const [numQuestions, setNumQuestions] = React.useState(20);
  const [passMark, setPassMark] = React.useState(defaultPassMark);
  const [durationMinutes, setDurationMinutes] = React.useState(30);
  const [customDuration, setCustomDuration] = React.useState('');
  const [linkExpiresAt, setLinkExpiresAt] = React.useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000))
  );
  const [randomizeOptions, setRandomizeOptions] = React.useState(defaultRandomizeOptions);

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ examLink: string; assessmentCode: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const availableSets = questionSets.filter((s) => s.competency_id === competencyId);

  function handleSelectCompetency(competency: Competency) {
    setCompetencyId(competency.id);
    setPassMark(competency.pass_mark);
    setQuestionSetId('');
  }

  // Skip the first run — candidateResults already starts from the
  // server-rendered initialCandidates; only refetch once the user types.
  const didMountCandidateSearch = React.useRef(false);
  React.useEffect(() => {
    if (!didMountCandidateSearch.current) {
      didMountCandidateSearch.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      const data = await getCandidates(candidateSearch);
      setCandidateResults(data as Candidate[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [candidateSearch]);

  function setCandidateField<K extends keyof typeof newCandidate>(key: K, value: string) {
    setNewCandidate((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});

    const payload = {
      candidate_id: candidateMode === 'existing' ? selectedCandidate?.id : undefined,
      new_candidate:
        candidateMode === 'new'
          ? {
              employee_id: newCandidate.employee_id,
              full_name: newCandidate.full_name,
              designation: newCandidate.designation,
              email: newCandidate.email,
              mobile: newCandidate.mobile,
              project_contract: newCandidate.project_contract,
              department: newCandidate.department,
            }
          : undefined,
      competency_id: competencyId,
      question_source: questionSource,
      question_set_id: questionSource === 'specific_set' ? questionSetId : null,
      num_questions: numQuestions,
      pass_mark: passMark,
      duration_minutes: durationMinutes,
      link_expires_at: new Date(linkExpiresAt).toISOString(),
      randomize_options: randomizeOptions,
    };

    const res = await createAssessment(payload);
    setSubmitting(false);

    if (!res.ok) {
      if (res.fieldErrors) setErrors(res.fieldErrors);
      if (res.error) toast.error(res.error);
      return;
    }

    toast.success('Assessment created — exam link is ready to share.');
    setResult({ examLink: res.examLink!, assessmentCode: res.assessmentCode! });
  }

  function handleCreateAnother() {
    setResult(null);
    setSelectedCandidate(null);
    setCandidateSearch('');
    setNewCandidate({
      employee_id: '',
      full_name: '',
      designation: '',
      email: '',
      mobile: '',
      project_contract: '',
      department: '',
    });
    setErrors({});
  }

  async function handleCopyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.examLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy automatically — select and copy the link manually.');
    }
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader className="items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <Link2 className="h-7 w-7 text-emerald-700" />
          </div>
          <CardTitle>Assessment Created</CardTitle>
          <CardDescription>
            Assessment code <span className="font-mono font-semibold text-slate-700">{result.assessmentCode}</span>.
            Share this one-time link with the candidate — it cannot be regenerated once used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <code className="flex-1 overflow-x-auto whitespace-nowrap text-sm text-slate-700">{result.examLink}</code>
            <Button type="button" size="sm" variant="outline" onClick={handleCopyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <Button type="button" variant="outline" onClick={handleCreateAnother}>
            <RotateCcw className="h-4 w-4" /> Create Another Assessment
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Candidate</CardTitle>
            <CardDescription>Select an existing candidate or add a new one on the fly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={candidateMode === 'existing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCandidateMode('existing')}
              >
                <Users className="h-3.5 w-3.5" /> Existing Candidate
              </Button>
              <Button
                type="button"
                variant={candidateMode === 'new' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCandidateMode('new')}
              >
                <UserPlus className="h-3.5 w-3.5" /> New Candidate
              </Button>
            </div>

            {candidateMode === 'existing' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search by name, employee ID, department…"
                    value={candidateSearch}
                    onChange={(e) => {
                      setCandidateSearch(e.target.value);
                      setSelectedCandidate(null);
                    }}
                  />
                </div>
                {!selectedCandidate && (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
                    {candidateResults.length === 0 && (
                      <p className="px-2 py-3 text-center text-sm text-slate-400">No candidates found</p>
                    )}
                    {candidateResults.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setSelectedCandidate(c)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{c.full_name}</span>
                        <span className="text-xs text-slate-400">{c.employee_id}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedCandidate && (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedCandidate.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {selectedCandidate.employee_id} · {selectedCandidate.department || 'No department'}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)}>
                      Change
                    </Button>
                  </div>
                )}
                {errors.candidate_id && <p className="text-xs font-medium text-rose-600">{errors.candidate_id}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Employee ID" htmlFor="nc_employee_id" required error={errors['new_candidate.employee_id']}>
                  <Input
                    id="nc_employee_id"
                    value={newCandidate.employee_id}
                    onChange={(e) => setCandidateField('employee_id', e.target.value)}
                  />
                </FormField>
                <FormField label="Full Name" htmlFor="nc_full_name" required>
                  <Input
                    id="nc_full_name"
                    value={newCandidate.full_name}
                    onChange={(e) => setCandidateField('full_name', e.target.value)}
                  />
                </FormField>
                <FormField label="Designation" htmlFor="nc_designation">
                  <Input
                    id="nc_designation"
                    value={newCandidate.designation}
                    onChange={(e) => setCandidateField('designation', e.target.value)}
                  />
                </FormField>
                <FormField label="Email" htmlFor="nc_email">
                  <Input
                    id="nc_email"
                    type="email"
                    value={newCandidate.email}
                    onChange={(e) => setCandidateField('email', e.target.value)}
                  />
                </FormField>
                <FormField label="Project / Contract" htmlFor="nc_project">
                  <Input
                    id="nc_project"
                    value={newCandidate.project_contract}
                    onChange={(e) => setCandidateField('project_contract', e.target.value)}
                  />
                </FormField>
                <FormField label="Department" htmlFor="nc_department">
                  <Input
                    id="nc_department"
                    value={newCandidate.department}
                    onChange={(e) => setCandidateField('department', e.target.value)}
                  />
                </FormField>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Competency &amp; Questions</CardTitle>
            <CardDescription>Choose the competency to assess and where the questions come from.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Competency</p>
              <div className="flex flex-wrap gap-2">
                {competencies.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => handleSelectCompetency(c)}
                    className={`rounded-full transition-opacity ${competencyId === c.id ? '' : 'opacity-50 hover:opacity-80'}`}
                  >
                    <CompetencyBadge code={c.code} name={`${c.code} — ${c.competency_name}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Question Source" htmlFor="question_source" required>
                <Select
                  id="question_source"
                  value={questionSource}
                  onChange={(e) => setQuestionSource(e.target.value as 'specific_set' | 'random')}
                >
                  <option value="specific_set">Specific Question Set</option>
                  <option value="random">Random from Competency Bank</option>
                </Select>
              </FormField>

              {questionSource === 'specific_set' && (
                <FormField label="Question Set" htmlFor="question_set_id" required error={errors.question_set_id}>
                  <Select id="question_set_id" value={questionSetId} onChange={(e) => setQuestionSetId(e.target.value)}>
                    <option value="">Select a set…</option>
                    {availableSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.set_name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}

              <FormField label="Number of Questions" htmlFor="num_questions" required>
                <Input
                  id="num_questions"
                  type="number"
                  min={1}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                />
              </FormField>

              <FormField
                label="Pass Mark (%)"
                htmlFor="pass_mark"
                required
                hint="Pre-filled from the competency's configured pass mark — adjust per-assessment if needed."
              >
                <Input
                  id="pass_mark"
                  type="number"
                  min={1}
                  max={100}
                  step={0.01}
                  value={passMark}
                  onChange={(e) => setPassMark(Number(e.target.value))}
                />
              </FormField>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={randomizeOptions}
                onChange={(e) => setRandomizeOptions(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Randomize answer option order per candidate
            </label>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Timing</CardTitle>
            <CardDescription>Duration is fixed once the exam starts; the server clock is authoritative.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Duration</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_DURATIONS_MINUTES.map((mins) => (
                  <Button
                    key={mins}
                    type="button"
                    size="sm"
                    variant={!customDuration && durationMinutes === mins ? 'default' : 'outline'}
                    onClick={() => {
                      setDurationMinutes(mins);
                      setCustomDuration('');
                    }}
                  >
                    {mins} min
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  placeholder="Custom minutes"
                  value={customDuration}
                  onChange={(e) => {
                    setCustomDuration(e.target.value);
                    const n = Number(e.target.value);
                    if (n > 0) setDurationMinutes(n);
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Selected: {formatDuration(durationMinutes)}</p>
            </div>

            <FormField
              label="Link Expiry"
              htmlFor="link_expires_at"
              required
              hint="If the candidate hasn't started the exam by this time, the link expires automatically."
              error={errors.link_expires_at}
            >
              <Input
                id="link_expires_at"
                type="datetime-local"
                value={linkExpiresAt}
                onChange={(e) => setLinkExpiresAt(e.target.value)}
              />
            </FormField>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Assessment & Generate Link'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </form>
  );
}

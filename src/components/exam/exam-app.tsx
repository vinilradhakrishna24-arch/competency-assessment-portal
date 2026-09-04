'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ExamErrorScreen } from '@/components/exam/error-screen';
import { VerificationForm } from '@/components/exam/verification-form';
import { WelcomeScreen, type WelcomeInfo } from '@/components/exam/welcome-screen';
import { ExamTakingScreen } from '@/components/exam/exam-taking-screen';
import { ReviewScreen } from '@/components/exam/review-screen';
import { ResultScreen } from '@/components/exam/result-screen';
import type { CandidateQuestionView } from '@/types/database';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; code?: string; message: string }
  | { kind: 'verify' }
  | { kind: 'welcome'; info: WelcomeInfo }
  | { kind: 'exam' }
  | { kind: 'review' }
  | { kind: 'result'; passed: boolean; score: number; assessmentCode: string };

interface StateResponse {
  ok: boolean;
  code?: string;
  message?: string;
  server_time: string;
  portal_name: string;
  assessment: {
    id: string;
    assessment_code: string;
    status: string;
    num_questions: number;
    duration_minutes: number;
    pass_mark: number;
    started_at: string | null;
    ends_at: string | null;
    link_expires_at: string;
    score_percentage: number | null;
  };
  candidate?: { full_name: string; employee_id: string; designation: string | null; project_contract: string | null };
  competency?: { code: string; competency_name: string };
  questions?: CandidateQuestionView[];
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export function ExamApp({
  token,
  portalName,
  logoUrl,
}: {
  token: string;
  portalName: string;
  logoUrl: string | null;
}) {
  const [view, setView] = React.useState<ViewState>({ kind: 'loading' });
  const [questions, setQuestions] = React.useState<CandidateQuestionView[]>([]);
  const [competency, setCompetency] = React.useState<{ code: string; competency_name: string } | null>(null);
  const [endsAt, setEndsAt] = React.useState<string | null>(null);
  const [serverTime, setServerTime] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const saveTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoSubmitInFlight = React.useRef(false);

  const loadState = React.useCallback(async () => {
    const res = await fetch(`/api/exam/${token}/state`);
    const data: StateResponse = await res.json();
    return data;
  }, [token]);

  const enterFromState = React.useCallback(
    (data: StateResponse, resuming: boolean) => {
      if (!data.ok) {
        setView({ kind: 'error', code: data.code, message: data.message ?? 'Unable to load this assessment.' });
        return;
      }

      setServerTime(data.server_time);
      if (data.competency) setCompetency(data.competency);

      if (data.assessment.status === 'STARTED' && data.questions) {
        setQuestions(data.questions);
        setEndsAt(data.assessment.ends_at);
        setView({ kind: 'exam' });
        if (resuming) {
          toast.success('Session restored. Your saved answers have been recovered.');
        }
        return;
      }

      if (data.assessment.status === 'PENDING' && data.candidate && data.competency) {
        setView({
          kind: 'welcome',
          info: {
            portalName: data.portal_name,
            logoUrl,
            candidateName: data.candidate.full_name,
            employeeId: data.candidate.employee_id,
            designation: data.candidate.designation,
            projectContract: data.candidate.project_contract,
            competencyCode: data.competency.code,
            competencyName: data.competency.competency_name,
            numQuestions: data.assessment.num_questions,
            durationMinutes: data.assessment.duration_minutes,
            passMark: data.assessment.pass_mark,
            linkExpiresAt: data.assessment.link_expires_at,
            resuming: false,
          },
        });
        return;
      }

      if (data.assessment.status === 'PASSED' || data.assessment.status === 'FAILED') {
        setView({
          kind: 'result',
          passed: data.assessment.status === 'PASSED',
          score: data.assessment.score_percentage ?? 0,
          assessmentCode: data.assessment.assessment_code,
        });
        return;
      }

      setView({ kind: 'error', message: 'This assessment cannot be accessed right now.' });
    },
    [logoUrl]
  );

  // Initial link-level precheck (no employee ID required).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/exam/${token}/precheck`);
      const data = await res.json();
      if (cancelled) return;
      if (!data.ok) {
        setView({ kind: 'error', code: data.code, message: data.message });
        return;
      }
      setView({ kind: 'verify' });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleVerify(employeeId: string): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(`/api/exam/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message };

    const state = await loadState();
    enterFromState(state, state.assessment.status === 'STARTED');
    return { ok: true };
  }

  async function handleStart() {
    setStarting(true);
    const data = await postJson<{ ok: boolean; ends_at?: string; server_time?: string; questions?: CandidateQuestionView[]; code?: string; message?: string }>(
      `/api/exam/${token}/start`
    );
    setStarting(false);

    if (!data.ok) {
      setView({ kind: 'error', code: data.code, message: data.message ?? 'Unable to start the assessment.' });
      return;
    }

    setQuestions(data.questions ?? []);
    setEndsAt(data.ends_at ?? null);
    setServerTime(data.server_time ?? null);
    setView({ kind: 'exam' });
  }

  function scheduleSave(assessmentQuestionId: string, selectedOptionIds: string[]) {
    const existing = saveTimers.current.get(assessmentQuestionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      try {
        await postJson(`/api/exam/${token}/answer`, {
          assessment_question_id: assessmentQuestionId,
          selected_option_ids: selectedOptionIds,
        });
      } catch {
        toast.error('Could not save your last answer. Retrying…');
        scheduleSave(assessmentQuestionId, selectedOptionIds);
      }
    }, 350);

    saveTimers.current.set(assessmentQuestionId, timer);
  }

  function handleToggleOption(assessmentQuestionId: string, optionId: string, isMultiple: boolean) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.assessment_question_id !== assessmentQuestionId) return q;
        let next: string[];
        if (isMultiple) {
          next = q.selected_option_ids.includes(optionId)
            ? q.selected_option_ids.filter((id) => id !== optionId)
            : [...q.selected_option_ids, optionId];
        } else {
          next = [optionId];
        }
        scheduleSave(assessmentQuestionId, next);
        return { ...q, selected_option_ids: next };
      })
    );
  }

  const finalizeSubmission = React.useCallback(
    (data: { status: string; score_percentage: number; passed: boolean; assessment_code: string }) => {
      setView({ kind: 'result', passed: data.passed, score: data.score_percentage, assessmentCode: data.assessment_code });
    },
    []
  );

  async function handleAutoExpire() {
    if (autoSubmitInFlight.current) return;
    autoSubmitInFlight.current = true;
    toast.message('Time is up — submitting your assessment automatically…');
    const data = await postJson<{ ok: boolean; status: string; score_percentage: number; passed: boolean; assessment_code: string }>(
      `/api/exam/${token}/submit`
    );
    if (data.ok) finalizeSubmission(data);
  }

  async function handleManualSubmit() {
    setSubmitting(true);
    const data = await postJson<{ ok: boolean; status: string; score_percentage: number; passed: boolean; assessment_code: string; message?: string }>(
      `/api/exam/${token}/submit`
    );
    setSubmitting(false);
    if (!data.ok) {
      toast.error(data.message ?? 'Unable to submit the assessment.');
      return;
    }
    finalizeSubmission(data);
  }

  async function handleDownloadCertificate() {
    const res = await fetch(`/api/exam/${token}/certificate`);
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message };
    return { ok: true, url: data.url as string };
  }

  if (view.kind === 'loading') {
    return <FullScreenSpinner portalName={portalName} />;
  }

  if (view.kind === 'error') {
    return <ExamErrorScreen code={view.code} message={view.message} portalName={portalName} />;
  }

  if (view.kind === 'verify') {
    return <VerificationForm portalName={portalName} logoUrl={logoUrl} onVerify={handleVerify} />;
  }

  if (view.kind === 'welcome') {
    return <WelcomeScreen info={view.info} onStart={handleStart} starting={starting} />;
  }

  if (view.kind === 'exam') {
    return (
      <ExamTakingScreen
        portalName={portalName}
        logoUrl={logoUrl}
        competencyName={competency?.competency_name ?? ''}
        questions={questions}
        endsAt={endsAt ?? new Date().toISOString()}
        serverTime={serverTime ?? new Date().toISOString()}
        currentIndex={currentIndex}
        onNavigate={setCurrentIndex}
        onToggleOption={handleToggleOption}
        onExpire={handleAutoExpire}
        onReview={() => setView({ kind: 'review' })}
      />
    );
  }

  if (view.kind === 'review') {
    return (
      <ReviewScreen
        questions={questions}
        onReturn={() => setView({ kind: 'exam' })}
        onJumpTo={(index) => {
          setCurrentIndex(index);
          setView({ kind: 'exam' });
        }}
        onSubmit={handleManualSubmit}
        submitting={submitting}
      />
    );
  }

  return (
    <ResultScreen
      passed={view.passed}
      scorePercentage={view.score}
      competencyCode={competency?.code ?? ''}
      competencyName={competency?.competency_name ?? ''}
      assessmentCode={view.assessmentCode}
      portalName={portalName}
      onDownloadCertificate={handleDownloadCertificate}
    />
  );
}

function FullScreenSpinner({ portalName }: { portalName: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-navy-800" />
      <p className="text-sm">{portalName}</p>
    </div>
  );
}

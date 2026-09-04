'use client';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CandidateQuestionView } from '@/types/database';

export function ReviewScreen({
  questions,
  onReturn,
  onJumpTo,
  onSubmit,
  submitting,
}: {
  questions: CandidateQuestionView[];
  onReturn: () => void;
  onJumpTo: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const answered = questions.filter((q) => q.selected_option_ids.length > 0).length;
  const unanswered = questions.length - answered;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Review &amp; Submit</h2>
        <div className="mb-6 grid grid-cols-3 gap-3 text-center">
          <Stat label="Total Questions" value={questions.length} />
          <Stat label="Answered" value={answered} tone="emerald" />
          <Stat label="Unanswered" value={unanswered} tone={unanswered > 0 ? 'amber' : undefined} />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {questions.map((q, idx) => {
            const isAnswered = q.selected_option_ids.length > 0;
            return (
              <button
                key={q.assessment_question_id}
                type="button"
                onClick={() => onJumpTo(idx)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  isAnswered
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                )}
              >
                {isAnswered ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">
                  Q{idx + 1} — {isAnswered ? 'Answered' : 'Unanswered'}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mb-6 text-center text-xs text-slate-400">
          Correct or incorrect answers are never shown before or after submission.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={onReturn} disabled={submitting}>
            RETURN TO EXAM
          </Button>
          <Button className="flex-1" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : (
              'SUBMIT ASSESSMENT'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p
        className={cn(
          'text-2xl font-semibold',
          tone === 'emerald' && 'text-emerald-700',
          tone === 'amber' && 'text-amber-700',
          !tone && 'text-slate-900'
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

'use client';

import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuestionCard } from '@/components/exam/question-card';
import { useCountdown } from '@/components/exam/use-countdown';
import { formatCountdown } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { CandidateQuestionView } from '@/types/database';

export function ExamTakingScreen({
  portalName,
  logoUrl,
  competencyName,
  questions,
  endsAt,
  serverTime,
  currentIndex,
  onNavigate,
  onToggleOption,
  onExpire,
  onReview,
}: {
  portalName: string;
  logoUrl: string | null;
  competencyName: string;
  questions: CandidateQuestionView[];
  endsAt: string;
  serverTime: string;
  currentIndex: number;
  onNavigate: (index: number) => void;
  onToggleOption: (assessmentQuestionId: string, optionId: string, isMultiple: boolean) => void;
  onExpire: () => void;
  onReview: () => void;
}) {
  const remainingSeconds = useCountdown(endsAt, serverTime, onExpire);
  const current = questions[currentIndex]!;
  const answeredCount = questions.filter((q) => q.selected_option_ids.length > 0).length;
  const isLow = remainingSeconds !== null && remainingSeconds <= 60;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy-900 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{portalName}</p>
            <p className="truncate text-xs text-slate-500">{competencyName}</p>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{answeredCount} answered</span>
              <span
                className={cn(
                  'rounded-md px-2 py-1 font-mono text-sm font-semibold tabular-nums',
                  isLow ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                )}
                aria-live="polite"
              >
                {remainingSeconds !== null ? formatCountdown(remainingSeconds) : '--:--'}
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-navy-800 transition-all"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <QuestionCard
          question={current}
          selected={current.selected_option_ids}
          onToggle={(optionId) =>
            onToggleOption(current.assessment_question_id, optionId, current.question_type === 'multiple')
          }
        />
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Button
            variant="outline"
            onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>
          {currentIndex < questions.length - 1 ? (
            <Button onClick={() => onNavigate(Math.min(questions.length - 1, currentIndex + 1))}>
              Next
            </Button>
          ) : (
            <Button onClick={onReview}>Review &amp; Submit</Button>
          )}
        </div>
      </div>
    </div>
  );
}

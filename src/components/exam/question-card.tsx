'use client';

import { cn } from '@/lib/utils';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { CandidateQuestionView } from '@/types/database';

export function QuestionCard({
  question,
  selected,
  onToggle,
}: {
  question: CandidateQuestionView;
  selected: string[];
  onToggle: (optionId: string) => void;
}) {
  const isMultiple = question.question_type === 'multiple';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {QUESTION_TYPE_LABELS[question.question_type]}
        </span>
        <span className="text-xs text-slate-400">{question.marks} mark{question.marks === 1 ? '' : 's'}</span>
      </div>

      {question.scenario_text && (
        <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Scenario</p>
          {question.scenario_text}
        </div>
      )}

      <p className="mb-5 text-base font-medium leading-relaxed text-slate-900 sm:text-lg">
        {question.display_order}. {question.question_text}
      </p>

      {isMultiple && (
        <p className="mb-3 text-xs font-medium text-slate-500">Select all that apply.</p>
      )}

      <div className="space-y-2.5" role={isMultiple ? 'group' : 'radiogroup'}>
        {question.options.map((option) => {
          const isSelected = selected.includes(option.option_id);
          return (
            <button
              key={option.option_id}
              type="button"
              role={isMultiple ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              onClick={() => onToggle(option.option_id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors sm:text-base',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy-700 focus-visible:ring-offset-1',
                isSelected
                  ? 'border-brand-navy-800 bg-brand-navy-50 text-brand-navy-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center border text-xs font-semibold',
                  isMultiple ? 'rounded-md' : 'rounded-full',
                  isSelected ? 'border-brand-navy-800 bg-brand-navy-800 text-white' : 'border-slate-300 text-transparent'
                )}
                aria-hidden="true"
              >
                {isSelected ? '✓' : ''}
              </span>
              <span className="font-medium text-slate-500">{option.option_key}.</span>
              <span className="flex-1">{option.option_text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

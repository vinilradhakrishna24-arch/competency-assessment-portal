import 'server-only';
import { randomInt } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { CandidateOption, QuestionSource, QuestionType } from '@/types/database';

export interface FrozenQuestionPayload {
  question_id: string;
  display_order: number;
  question_text_snapshot: string;
  scenario_text_snapshot: string | null;
  question_type_snapshot: QuestionType;
  marks_snapshot: number;
  option_order_snapshot: CandidateOption[];
  correct_option_ids: string[];
}

/** Fisher–Yates shuffle using a CSPRNG rather than Math.random, so question
 * order and option order are not predictable/reproducible. */
function secureShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

interface SelectQuestionsArgs {
  competencyId: string;
  questionSource: QuestionSource;
  questionSetId: string | null;
  numQuestions: number;
  randomizeOptions: boolean;
}

/**
 * Select and freeze the question set for a new assessment attempt.
 * This is the ONLY place random selection happens — once this runs and the
 * result is persisted via fn_create_assessment_with_questions, the exam
 * question list is immutable for the lifetime of that attempt (see
 * migration 0003/0004 — assessment_questions is never regenerated).
 */
export async function selectAndFreezeQuestions({
  competencyId,
  questionSource,
  questionSetId,
  numQuestions,
  randomizeOptions,
}: SelectQuestionsArgs): Promise<FrozenQuestionPayload[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from('questions')
    .select('id, question_text, scenario_text, question_type, marks, question_options(id, option_key, option_text, is_correct)')
    .eq('competency_id', competencyId)
    .eq('active', true);

  if (questionSource === 'specific_set') {
    if (!questionSetId) throw new Error('question_set_id is required for specific_set mode');
    query = query.eq('question_set_id', questionSetId);
  }

  const { data: questions, error } = await query;
  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  if (!questions || questions.length === 0) {
    throw new Error('No active questions are available for the selected competency/set.');
  }
  if (questions.length < numQuestions) {
    throw new Error(
      `Only ${questions.length} active question(s) are available, but ${numQuestions} were requested.`
    );
  }

  const chosen = secureShuffle(questions).slice(0, numQuestions);

  return chosen.map((q, index) => {
    type OptionRow = { id: string; option_key: string; option_text: string; is_correct: boolean };
    const options = (q.question_options as OptionRow[]) ?? [];
    if (options.length < 2) {
      throw new Error(`Question ${q.id} does not have enough answer options configured.`);
    }

    const orderedOptions = randomizeOptions ? secureShuffle(options) : [...options].sort((a, b) =>
      a.option_key.localeCompare(b.option_key)
    );

    const optionOrderSnapshot: CandidateOption[] = orderedOptions.map((o) => ({
      option_id: o.id,
      option_key: o.option_key,
      option_text: o.option_text,
    }));

    const correctOptionIds = options.filter((o) => o.is_correct).map((o) => o.id);

    return {
      question_id: q.id,
      display_order: index + 1,
      question_text_snapshot: q.question_text,
      scenario_text_snapshot: q.scenario_text,
      question_type_snapshot: q.question_type as QuestionType,
      marks_snapshot: q.marks,
      option_order_snapshot: optionOrderSnapshot,
      correct_option_ids: correctOptionIds,
    };
  });
}

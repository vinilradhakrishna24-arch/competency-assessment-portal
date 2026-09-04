'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { questionSchema, type QuestionInput } from '@/lib/validation/schemas';
import { flattenZod } from '@/lib/validation/flatten';
import { writeAuditLog } from '@/lib/audit/log';
import { AUDIT_ACTIONS } from '@/lib/constants';
import type { ActionResult } from '@/lib/actions/types';

function toNullable(value: string | undefined | null): string | null {
  return value && value.trim() !== '' ? value.trim() : null;
}

export async function createQuestion(input: QuestionInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: question, error } = await supabase
    .from('questions')
    .insert({
      competency_id: parsed.data.competency_id,
      question_set_id: parsed.data.question_set_id || null,
      question_type: parsed.data.question_type,
      question_text: parsed.data.question_text,
      scenario_text: toNullable(parsed.data.scenario_text),
      marks: parsed.data.marks,
      difficulty: parsed.data.difficulty || null,
      explanation_admin_only: toNullable(parsed.data.explanation_admin_only),
      active: parsed.data.active,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !question) return { ok: false, error: error?.message ?? 'Failed to create question' };

  const optionsPayload = parsed.data.options.map((opt, idx) => ({
    question_id: question.id,
    option_key: opt.option_key,
    option_text: opt.option_text,
    is_correct: opt.is_correct,
    sort_order: idx,
  }));

  const { error: optError } = await supabase.from('question_options').insert(optionsPayload);
  if (optError) {
    await supabase.from('questions').delete().eq('id', question.id);
    return { ok: false, error: optError.message };
  }

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.QUESTION_CREATED,
    entityType: 'question',
    entityId: question.id,
    newValue: parsed.data,
  });

  revalidatePath('/questions');
  return { ok: true };
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('questions').select('*').eq('id', id).maybeSingle();

  const { error } = await supabase
    .from('questions')
    .update({
      competency_id: parsed.data.competency_id,
      question_set_id: parsed.data.question_set_id || null,
      question_type: parsed.data.question_type,
      question_text: parsed.data.question_text,
      scenario_text: toNullable(parsed.data.scenario_text),
      marks: parsed.data.marks,
      difficulty: parsed.data.difficulty || null,
      explanation_admin_only: toNullable(parsed.data.explanation_admin_only),
      active: parsed.data.active,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  // Replace options wholesale — simplest way to keep option_key/order/
  // is_correct consistent with the submitted form. Existing frozen
  // assessment_questions snapshots are untouched (they store their own copy).
  await supabase.from('question_options').delete().eq('question_id', id);
  const optionsPayload = parsed.data.options.map((opt, idx) => ({
    question_id: id,
    option_key: opt.option_key,
    option_text: opt.option_text,
    is_correct: opt.is_correct,
    sort_order: idx,
  }));
  const { error: optError } = await supabase.from('question_options').insert(optionsPayload);
  if (optError) return { ok: false, error: optError.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.QUESTION_UPDATED,
    entityType: 'question',
    entityId: id,
    oldValue: before,
    newValue: parsed.data,
  });

  revalidatePath('/questions');
  return { ok: true };
}

export async function setQuestionActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('questions').update({ active }).eq('id', id);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.QUESTION_DEACTIVATED,
    entityType: 'question',
    entityId: id,
    newValue: { active },
  });

  revalidatePath('/questions');
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorUserId: user.id,
    actorType: 'admin',
    action: AUDIT_ACTIONS.QUESTION_DELETED,
    entityType: 'question',
    entityId: id,
  });

  revalidatePath('/questions');
  return { ok: true };
}

export async function getQuestions(filters?: {
  competencyId?: string;
  questionSetId?: string;
  activeOnly?: boolean;
  search?: string;
}) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('questions')
    .select('*, question_options(*), competencies(code, competency_name), question_sets(set_name)')
    .order('created_at', { ascending: false });

  if (filters?.competencyId) query = query.eq('competency_id', filters.competencyId);
  if (filters?.questionSetId) query = query.eq('question_set_id', filters.questionSetId);
  if (filters?.activeOnly) query = query.eq('active', true);
  if (filters?.search) query = query.ilike('question_text', `%${filters.search}%`);

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data;
}

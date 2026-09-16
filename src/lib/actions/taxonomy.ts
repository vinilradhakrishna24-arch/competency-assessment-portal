'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { questionSetSchema, competencySchema, competencyAreaSchema } from '@/lib/validation/schemas';
import { flattenZod } from '@/lib/validation/flatten';
import type { ActionResult } from '@/lib/actions/types';
import { z } from 'zod';

export async function getCompetencies() {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('competencies').select('*').order('code');
  if (error) throw new Error(error.message);
  return data;
}

export async function getQuestionSets(competencyId?: string) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('question_sets').select('*, competencies(code, competency_name)').order('set_name');
  if (competencyId) query = query.eq('competency_id', competencyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function createQuestionSet(input: z.infer<typeof questionSetSchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = questionSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('question_sets').insert({
    competency_id: parsed.data.competency_id,
    set_name: parsed.data.set_name,
    description: parsed.data.description || null,
    active: parsed.data.active,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, fieldErrors: { set_name: 'A set with this name already exists for this competency.' } };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/questions');
  return { ok: true };
}

export async function updateQuestionSetActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('question_sets').update({ active }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/questions');
  return { ok: true };
}

export async function updateCompetency(
  id: string,
  input: z.infer<typeof competencySchema>
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = competencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();

  // HSE-only fields are only ever included in the update when the caller
  // actually sent them -- the existing technical Pass Marks card only sends
  // the four fields above, and must not reset amber_threshold/validity/etc.
  // back to a default on every save.
  const update: Record<string, unknown> = {
    competency_name: parsed.data.competency_name,
    description: parsed.data.description || null,
    pass_mark: parsed.data.pass_mark,
    active: parsed.data.active,
  };
  if (parsed.data.amber_threshold !== undefined) update.amber_threshold = parsed.data.amber_threshold;
  if (parsed.data.validity_months !== undefined) update.validity_months = parsed.data.validity_months;
  if (parsed.data.reassessment_wait_days !== undefined) update.reassessment_wait_days = parsed.data.reassessment_wait_days;
  if (parsed.data.requires_result_approval !== undefined) update.requires_result_approval = parsed.data.requires_result_approval;

  const { error } = await supabase.from('competencies').update(update).eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/questions');
  return { ok: true };
}

// =====================================================================
// Competency Areas (HSE) -- sub-topics used to tag questions and break
// assessment scores down by area. Every technical competency simply has
// zero rows here and is entirely unaffected.
// =====================================================================

export async function getCompetencyAreas(competencyId?: string) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('competency_areas').select('*').order('sort_order').order('code');
  if (competencyId) query = query.eq('competency_id', competencyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function createCompetencyArea(input: z.infer<typeof competencyAreaSchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = competencyAreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('competency_areas').insert({
    competency_id: parsed.data.competency_id,
    code: parsed.data.code,
    area_name: parsed.data.area_name,
    sort_order: parsed.data.sort_order,
    active: parsed.data.active,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, fieldErrors: { code: 'An area with this code already exists for this competency.' } };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings');
  revalidatePath('/questions');
  return { ok: true };
}

export async function updateCompetencyArea(
  id: string,
  input: z.infer<typeof competencyAreaSchema>
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = competencyAreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenZod(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('competency_areas')
    .update({
      code: parsed.data.code,
      area_name: parsed.data.area_name,
      sort_order: parsed.data.sort_order,
      active: parsed.data.active,
    })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, fieldErrors: { code: 'An area with this code already exists for this competency.' } };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings');
  revalidatePath('/questions');
  return { ok: true };
}

export async function setCompetencyAreaActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('competency_areas').update({ active }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/questions');
  return { ok: true };
}

export async function deleteCompetencyArea(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('competency_areas').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        error: 'This area is already used by one or more questions. Deactivate it instead of deleting it.',
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath('/settings');
  revalidatePath('/questions');
  return { ok: true };
}

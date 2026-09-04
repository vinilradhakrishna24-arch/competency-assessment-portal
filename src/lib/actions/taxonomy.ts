'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { questionSetSchema, competencySchema } from '@/lib/validation/schemas';
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
  const { error } = await supabase
    .from('competencies')
    .update({
      competency_name: parsed.data.competency_name,
      description: parsed.data.description || null,
      pass_mark: parsed.data.pass_mark,
      active: parsed.data.active,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/questions');
  return { ok: true };
}

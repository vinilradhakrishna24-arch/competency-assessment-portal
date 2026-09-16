'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { questionSchema, type QuestionInput } from '@/lib/validation/schemas';
import { flattenZod } from '@/lib/validation/flatten';
import { writeAuditLog } from '@/lib/audit/log';
import {
  AUDIT_ACTIONS,
  QUESTION_IMAGES_BUCKET,
  MAX_QUESTION_IMAGE_BYTES,
  ALLOWED_QUESTION_IMAGE_TYPES,
} from '@/lib/constants';
import type { ActionResult } from '@/lib/actions/types';

function toNullable(value: string | undefined | null): string | null {
  return value && value.trim() !== '' ? value.trim() : null;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface UploadImageResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Upload a Question Bank image and return its public URL. Called from the
 * Add/Edit Question form the moment the examiner picks a file — separate
 * from createQuestion/updateQuestion so the (potentially several-MB) file
 * bytes never have to round-trip through the plain-object QuestionInput
 * those actions already use everywhere else. */
export async function uploadQuestionImage(formData: FormData): Promise<UploadImageResult> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'No file was provided.' };

  if (!ALLOWED_QUESTION_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_QUESTION_IMAGE_TYPES)[number])) {
    return { ok: false, error: 'Only JPG, JPEG, PNG and WebP images are supported.' };
  }
  if (file.size > MAX_QUESTION_IMAGE_BYTES) {
    return { ok: false, error: `Image is too large — the limit is ${Math.floor(MAX_QUESTION_IMAGE_BYTES / (1024 * 1024))}MB.` };
  }

  const ext = EXTENSION_BY_MIME[file.type] ?? 'jpg';
  const path = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(QUESTION_IMAGES_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  const { data } = admin.storage.from(QUESTION_IMAGES_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** Best-effort cleanup of a replaced/removed question image. Never throws —
 * a storage hiccup here must not block saving/deleting the question itself. */
async function deleteQuestionImageObject(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  const marker = `/object/public/${QUESTION_IMAGES_BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;
  const path = imageUrl.slice(idx + marker.length);
  if (!path) return;

  try {
    const admin = createSupabaseAdminClient();
    await admin.storage.from(QUESTION_IMAGES_BUCKET).remove([path]);
  } catch (err) {
    console.error('[questions] failed to delete question image', imageUrl, err);
  }
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
      competency_area_id: parsed.data.competency_area_id || null,
      question_set_id: parsed.data.question_set_id || null,
      question_type: parsed.data.question_type,
      question_text: parsed.data.question_text,
      scenario_text: toNullable(parsed.data.scenario_text),
      marks: parsed.data.marks,
      difficulty: parsed.data.difficulty || null,
      explanation_admin_only: toNullable(parsed.data.explanation_admin_only),
      active: parsed.data.active,
      image_url: toNullable(parsed.data.image_url),
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

  const newImageUrl = toNullable(parsed.data.image_url);

  const { error } = await supabase
    .from('questions')
    .update({
      competency_id: parsed.data.competency_id,
      competency_area_id: parsed.data.competency_area_id || null,
      question_set_id: parsed.data.question_set_id || null,
      question_type: parsed.data.question_type,
      question_text: parsed.data.question_text,
      scenario_text: toNullable(parsed.data.scenario_text),
      marks: parsed.data.marks,
      difficulty: parsed.data.difficulty || null,
      explanation_admin_only: toNullable(parsed.data.explanation_admin_only),
      active: parsed.data.active,
      image_url: newImageUrl,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  // Image was replaced or removed — clean up the old file. Existing frozen
  // assessment_questions.image_url_snapshot rows keep their own copy of the
  // old URL and are completely unaffected by this.
  if (before?.image_url && before.image_url !== newImageUrl) {
    await deleteQuestionImageObject(before.image_url);
  }

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
  const { data: existing } = await supabase.from('questions').select('image_url').eq('id', id).maybeSingle();
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  if (existing?.image_url) await deleteQuestionImageObject(existing.image_url);

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
  competencyAreaId?: string;
  questionSetId?: string;
  activeOnly?: boolean;
  search?: string;
}) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('questions')
    .select(
      '*, question_options(*), competencies(code, competency_name), question_sets(set_name), competency_areas(code, area_name)'
    )
    .order('created_at', { ascending: false });

  if (filters?.competencyId) query = query.eq('competency_id', filters.competencyId);
  if (filters?.competencyAreaId) query = query.eq('competency_area_id', filters.competencyAreaId);
  if (filters?.questionSetId) query = query.eq('question_set_id', filters.questionSetId);
  if (filters?.activeOnly) query = query.eq('active', true);
  if (filters?.search) query = query.ilike('question_text', `%${filters.search}%`);

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data;
}

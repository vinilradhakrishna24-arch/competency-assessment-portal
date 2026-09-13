-- =====================================================================
-- 0010_question_images.sql
-- Adds optional image support to the Question Bank.
--
-- - questions.image_url: set by the examiner via the Add/Edit Question
--   form. Nullable — the large majority of questions remain text-only.
-- - assessment_questions.image_url_snapshot: the frozen copy for a given
--   attempt, written once by fn_create_assessment_with_questions and never
--   regenerated (same invariant as every other *_snapshot column — later
--   edits/deletes on the master question never affect exams already
--   created from it).
-- - A new public Storage bucket, question-images, holds the actual files.
--   Unlike the certificates bucket, these images are not sensitive (they
--   are typically safety/PPE diagrams referenced by an exam question), so
--   the bucket is public and served by stable public URLs rather than
--   short-lived signed URLs -- this avoids minting a signed URL for every
--   image on every question load, on every exam page load, for every
--   candidate. All writes (upload/delete) still go exclusively through the
--   service-role client from admin Server Actions -- see
--   src/lib/actions/questions.ts -- mirroring the existing precedent in
--   src/lib/actions/assessments.ts of using the service-role client
--   directly from 'use server' actions. No client-side storage.objects
--   policy is required for this bucket: reads go through the public URL
--   endpoint (bypasses RLS because the bucket is public) and writes only
--   ever happen server-side with the service role (which bypasses RLS
--   entirely regardless).
-- =====================================================================

alter table questions add column if not exists image_url text;
alter table assessment_questions add column if not exists image_url_snapshot text;

insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

-- Re-create fn_create_assessment_with_questions (0004_functions.sql) to
-- also freeze image_url_snapshot from the payload. Everything else is
-- byte-for-byte identical to the original definition.
create or replace function fn_create_assessment_with_questions(p_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_assessment_id uuid;
  v_row jsonb;
begin
  insert into assessments (
    assessment_code, candidate_id, competency_id, question_set_id,
    question_source, num_questions, pass_mark, duration_minutes,
    link_expires_at, token_hash, randomize_options, status,
    attempt_number, parent_assessment_id, created_by
  ) values (
    p_payload->>'assessment_code',
    (p_payload->>'candidate_id')::uuid,
    (p_payload->>'competency_id')::uuid,
    nullif(p_payload->>'question_set_id','')::uuid,
    p_payload->>'question_source',
    (p_payload->>'num_questions')::int,
    (p_payload->>'pass_mark')::numeric,
    (p_payload->>'duration_minutes')::int,
    (p_payload->>'link_expires_at')::timestamptz,
    p_payload->>'token_hash',
    coalesce((p_payload->>'randomize_options')::boolean, false),
    'PENDING',
    coalesce((p_payload->>'attempt_number')::int, 1),
    nullif(p_payload->>'parent_assessment_id','')::uuid,
    nullif(p_payload->>'created_by','')::uuid
  )
  returning id into v_assessment_id;

  insert into assessment_questions (
    assessment_id, question_id, display_order, question_text_snapshot,
    scenario_text_snapshot, question_type_snapshot, marks_snapshot,
    option_order_snapshot, correct_option_ids, image_url_snapshot
  )
  select
    v_assessment_id,
    nullif(q->>'question_id','')::uuid,
    (q->>'display_order')::int,
    q->>'question_text_snapshot',
    q->>'scenario_text_snapshot',
    q->>'question_type_snapshot',
    (q->>'marks_snapshot')::numeric,
    q->'option_order_snapshot',
    q->'correct_option_ids',
    q->>'image_url_snapshot'
  from jsonb_array_elements(p_payload->'questions') as q;

  select to_jsonb(a) into v_row from assessments a where a.id = v_assessment_id;
  return v_row;
end;
$$;

-- =====================================================================
-- 0004_functions.sql
-- Atomic, transaction-safe operations for the exam lifecycle.
-- All functions run inside Postgres's implicit per-call transaction and
-- use row locking (`for update`) so double-clicks, multiple tabs, and
-- concurrent requests cannot corrupt state or duplicate results.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Create an assessment + its frozen question snapshot in one transaction.
-- p_payload shape:
-- {
--   "assessment_code": "...", "candidate_id": "...", "competency_id": "...",
--   "question_set_id": "...", "question_source": "specific_set|random",
--   "num_questions": 30, "pass_mark": 85.00, "duration_minutes": 30,
--   "link_expires_at": "iso", "token_hash": "...", "randomize_options": false,
--   "created_by": "...", "attempt_number": 1, "parent_assessment_id": null,
--   "questions": [
--     { "question_id": "...", "display_order": 1,
--       "question_text_snapshot": "...", "scenario_text_snapshot": null,
--       "question_type_snapshot": "single", "marks_snapshot": 1,
--       "option_order_snapshot": [{"option_id":"...","option_key":"A","option_text":"..."}],
--       "correct_option_ids": ["..."] }
--   ]
-- }
-- ---------------------------------------------------------------------
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
    option_order_snapshot, correct_option_ids
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
    q->'correct_option_ids'
  from jsonb_array_elements(p_payload->'questions') as q;

  select to_jsonb(a) into v_row from assessments a where a.id = v_assessment_id;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Start an exam. Only transitions PENDING -> STARTED, exactly once.
-- Idempotent: if already started, returns the original started_at/ends_at.
-- ---------------------------------------------------------------------
create or replace function fn_start_assessment(p_assessment_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_row assessments%rowtype;
begin
  select * into v_row from assessments where id = p_assessment_id for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Auto-expire if the link window has passed and it never started
  if v_row.status = 'PENDING' and now() > v_row.link_expires_at then
    update assessments set status = 'EXPIRED' where id = p_assessment_id
      returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_row.status = 'PENDING' then
    update assessments
       set status = 'STARTED',
           started_at = now(),
           ends_at = now() + make_interval(mins => v_row.duration_minutes)
     where id = p_assessment_id
     returning * into v_row;
  end if;

  -- If already STARTED (or any other terminal state), fall through and
  -- return the existing row untouched — never reset or extend the timer.
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------
-- Internal: score + finalize a STARTED assessment. Caller must have
-- already locked/validated the row is STARTED. Idempotent via the
-- unique constraint on results.assessment_id.
-- ---------------------------------------------------------------------
create or replace function fn_finalize_assessment(p_assessment_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_assessment assessments%rowtype;
  v_earned numeric := 0;
  v_available numeric := 0;
  v_percentage numeric := 0;
  v_passed boolean;
  v_final_status text;
  v_result jsonb;
begin
  select * into v_assessment from assessments where id = p_assessment_id for update;

  select
    coalesce(sum(aq.marks_snapshot) filter (
      where (
        select coalesce(array_agg(x order by x), array[]::text[])
        from jsonb_array_elements_text(coalesce(a.selected_option_ids, '[]'::jsonb)) x
      ) = (
        select coalesce(array_agg(y order by y), array[]::text[])
        from jsonb_array_elements_text(aq.correct_option_ids) y
      )
    ), 0),
    coalesce(sum(aq.marks_snapshot), 0)
  into v_earned, v_available
  from assessment_questions aq
  left join answers a on a.assessment_question_id = aq.id
  where aq.assessment_id = p_assessment_id;

  if v_available > 0 then
    v_percentage := (v_earned / v_available) * 100;
  else
    v_percentage := 0;
  end if;

  v_passed := v_percentage >= v_assessment.pass_mark;
  v_final_status := case when v_passed then 'PASSED' else 'FAILED' end;

  update assessments
     set status = v_final_status,
         submitted_at = now(),
         score_percentage = v_percentage,
         earned_marks = v_earned,
         available_marks = v_available
   where id = p_assessment_id;

  insert into results (assessment_id, score_percentage, earned_marks, available_marks, pass_mark_used, passed)
  values (p_assessment_id, v_percentage, v_earned, v_available, v_assessment.pass_mark, v_passed)
  on conflict (assessment_id) do nothing;

  select jsonb_build_object(
    'assessment_id', p_assessment_id,
    'status', v_final_status,
    'score_percentage', v_percentage,
    'earned_marks', v_earned,
    'available_marks', v_available,
    'pass_mark_used', v_assessment.pass_mark,
    'passed', v_passed
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Manual or auto submission entry point. Safe to call multiple times —
-- only the first call (while status = STARTED) actually scores; every
-- later call returns the already-computed result.
-- ---------------------------------------------------------------------
create or replace function fn_submit_assessment(p_assessment_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_status text;
  v_existing jsonb;
begin
  select status into v_status from assessments where id = p_assessment_id for update;

  if v_status is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_status in ('PASSED', 'FAILED') then
    select jsonb_build_object(
      'assessment_id', a.id, 'status', a.status,
      'score_percentage', a.score_percentage, 'earned_marks', a.earned_marks,
      'available_marks', a.available_marks, 'pass_mark_used', a.pass_mark,
      'passed', (a.status = 'PASSED')
    ) into v_existing
    from assessments a where a.id = p_assessment_id;
    return v_existing;
  end if;

  if v_status <> 'STARTED' then
    return jsonb_build_object('error', 'invalid_status', 'status', v_status);
  end if;

  return fn_finalize_assessment(p_assessment_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Called on every load/answer/submit request to enforce the
-- server-authoritative timer: if time is up, finalize immediately
-- instead of trusting the client. Also expires un-started PENDING links.
-- ---------------------------------------------------------------------
create or replace function fn_check_and_expire_assessment(p_assessment_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_row assessments%rowtype;
begin
  select * into v_row from assessments where id = p_assessment_id for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_row.status = 'PENDING' and now() > v_row.link_expires_at then
    update assessments set status = 'EXPIRED' where id = p_assessment_id returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_row.status = 'STARTED' and now() >= v_row.ends_at then
    perform fn_finalize_assessment(p_assessment_id);
    select * into v_row from assessments where id = p_assessment_id;
    return to_jsonb(v_row);
  end if;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------
-- Autosave an answer. Upserts by assessment_question_id. Rejects writes
-- once the assessment is no longer STARTED (defense in depth — the API
-- route also checks this before calling in).
-- ---------------------------------------------------------------------
create or replace function fn_save_answer(
  p_assessment_id uuid,
  p_assessment_question_id uuid,
  p_selected_option_ids jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from assessments where id = p_assessment_id for update;

  if v_status is distinct from 'STARTED' then
    return jsonb_build_object('error', 'not_active', 'status', v_status);
  end if;

  insert into answers (assessment_id, assessment_question_id, selected_option_ids, saved_at)
  values (p_assessment_id, p_assessment_question_id, p_selected_option_ids, now())
  on conflict (assessment_question_id)
    do update set selected_option_ids = excluded.selected_option_ids, saved_at = now();

  return jsonb_build_object('ok', true, 'saved_at', now());
end;
$$;

-- ---------------------------------------------------------------------
-- Record a candidate verification attempt with atomic rate limiting.
-- ---------------------------------------------------------------------
create or replace function fn_record_verification_attempt(
  p_assessment_id uuid,
  p_success boolean,
  p_ip text,
  p_user_agent text,
  p_max_attempts int default 5,
  p_lock_minutes int default 15
)
returns jsonb
language plpgsql
as $$
declare
  v_row assessments%rowtype;
  v_locked boolean := false;
begin
  select * into v_row from assessments where id = p_assessment_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  insert into verification_attempts (assessment_id, success, ip_address, user_agent)
  values (p_assessment_id, p_success, p_ip, p_user_agent);

  if v_row.verification_locked_until is not null and v_row.verification_locked_until > now() then
    return jsonb_build_object('locked', true, 'locked_until', v_row.verification_locked_until);
  end if;

  if p_success then
    update assessments set verification_fail_count = 0, verification_locked_until = null
     where id = p_assessment_id;
    return jsonb_build_object('locked', false);
  end if;

  update assessments
     set verification_fail_count = verification_fail_count + 1
   where id = p_assessment_id
   returning * into v_row;

  if v_row.verification_fail_count >= p_max_attempts then
    update assessments
       set verification_locked_until = now() + make_interval(mins => p_lock_minutes)
     where id = p_assessment_id
     returning * into v_row;
    v_locked := true;
  end if;

  return jsonb_build_object('locked', v_locked, 'locked_until', v_row.verification_locked_until);
end;
$$;

-- ---------------------------------------------------------------------
-- Authorize a reassessment: create a brand-new attempt from a FAILED
-- assessment without ever touching the original row.
-- ---------------------------------------------------------------------
create or replace function fn_authorize_reassessment(p_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_original assessments%rowtype;
begin
  select * into v_original from assessments where id = (p_payload->>'original_assessment_id')::uuid for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_original.status <> 'FAILED' then
    return jsonb_build_object('error', 'not_failed', 'status', v_original.status);
  end if;

  return fn_create_assessment_with_questions(
    p_payload - 'original_assessment_id' ||
    jsonb_build_object(
      'attempt_number', v_original.attempt_number + 1,
      'parent_assessment_id', v_original.id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Create the certificate record (idempotent). PDF bytes are generated
-- and uploaded to Storage separately by the Node server, which then
-- fills in storage_path.
-- ---------------------------------------------------------------------
create or replace function fn_create_certificate_record(
  p_assessment_id uuid,
  p_certificate_number text,
  p_verification_code text
)
returns jsonb
language plpgsql
as $$
declare
  v_assessment assessments%rowtype;
  v_cert certificates%rowtype;
begin
  select * into v_assessment from assessments where id = p_assessment_id for update;

  if not found or v_assessment.status <> 'PASSED' then
    return jsonb_build_object('error', 'not_passed');
  end if;

  select * into v_cert from certificates where assessment_id = p_assessment_id;
  if found then
    return to_jsonb(v_cert);
  end if;

  insert into certificates (
    assessment_id, candidate_id, competency_id, certificate_number,
    verification_code, score_percentage
  ) values (
    p_assessment_id, v_assessment.candidate_id, v_assessment.competency_id,
    p_certificate_number, p_verification_code, v_assessment.score_percentage
  )
  returning * into v_cert;

  return to_jsonb(v_cert);
end;
$$;

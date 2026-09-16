-- =====================================================================
-- 0013_hse_scoring_and_approval_functions.sql
-- Extends the exam-lifecycle functions (0004/0010) for the HSE module:
--   - fn_finalize_assessment: per-competency-area RAG scoring (HSE only,
--     gated on amber_threshold being set) + the PASSED -> AWAITING_APPROVAL
--     branch (gated on competencies.requires_result_approval).
--   - fn_authorize_reassessment: server-side reassessment wait-period
--     enforcement (gated on competencies.reassessment_wait_days, which
--     defaults to 0 -- today's technical behavior is unchanged).
--   - fn_create_certificate_record: guard widened to also accept a
--     CERTIFIED assessment (the outcome of an approved result), alongside
--     the existing PASSED path which is completely unchanged.
--   - fn_approve_result / fn_reject_result: new functions implementing
--     the AWAITING_APPROVAL -> CERTIFIED / FAILED transitions.
--
-- Every branch added here is inert for LOA/SFT/PTW: amber_threshold is
-- null, requires_result_approval is false, and reassessment_wait_days is
-- 0 for all three, by the defaults set in 0011. Existing technical exam
-- scoring, certificate issuance, and reassessment therefore behave
-- exactly as before this migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_finalize_assessment
-- ---------------------------------------------------------------------
create or replace function fn_finalize_assessment(p_assessment_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_assessment assessments%rowtype;
  v_competency competencies%rowtype;
  v_earned numeric := 0;
  v_available numeric := 0;
  v_percentage numeric := 0;
  v_passed boolean;
  v_final_status text;
  v_result jsonb;
begin
  select * into v_assessment from assessments where id = p_assessment_id for update;
  select * into v_competency from competencies where id = v_assessment.competency_id;

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

  if v_passed and coalesce(v_competency.requires_result_approval, false) then
    v_final_status := 'AWAITING_APPROVAL';
  elsif v_passed then
    v_final_status := 'PASSED';
  else
    v_final_status := 'FAILED';
  end if;

  update assessments
     set status = v_final_status,
         submitted_at = now(),
         score_percentage = v_percentage,
         earned_marks = v_earned,
         available_marks = v_available
   where id = p_assessment_id;

  -- `results.passed` records whether the raw score met the pass mark,
  -- independent of the approval gate -- unchanged meaning from before.
  insert into results (assessment_id, score_percentage, earned_marks, available_marks, pass_mark_used, passed)
  values (p_assessment_id, v_percentage, v_earned, v_available, v_assessment.pass_mark, v_passed)
  on conflict (assessment_id) do nothing;

  -- Per-competency-area RAG breakdown -- HSE only (amber_threshold set).
  -- Skipped entirely for technical competencies, so LOA/SFT/PTW
  -- finalization writes nothing new here.
  if v_competency.amber_threshold is not null then
    insert into assessment_area_scores (assessment_id, competency_area_id, earned_marks, available_marks, score_percentage, band)
    with per_area as (
      select
        aq.competency_area_id_snapshot as competency_area_id,
        sum(aq.marks_snapshot) filter (
          where (
            select coalesce(array_agg(x order by x), array[]::text[])
            from jsonb_array_elements_text(coalesce(a.selected_option_ids, '[]'::jsonb)) x
          ) = (
            select coalesce(array_agg(y order by y), array[]::text[])
            from jsonb_array_elements_text(aq.correct_option_ids) y
          )
        ) as earned,
        sum(aq.marks_snapshot) as available
      from assessment_questions aq
      left join answers a on a.assessment_question_id = aq.id
      where aq.assessment_id = p_assessment_id
        and aq.competency_area_id_snapshot is not null
      group by aq.competency_area_id_snapshot
    )
    select
      p_assessment_id,
      competency_area_id,
      coalesce(earned, 0),
      coalesce(available, 0),
      case when coalesce(available, 0) > 0 then (coalesce(earned, 0) / available) * 100 else 0 end,
      case
        when coalesce(available, 0) = 0 then 'red'
        when (case when available > 0 then (coalesce(earned, 0) / available) * 100 else 0 end) >= v_assessment.pass_mark then 'green'
        when (case when available > 0 then (coalesce(earned, 0) / available) * 100 else 0 end) >= v_competency.amber_threshold then 'amber'
        else 'red'
      end
    from per_area
    on conflict (assessment_id, competency_area_id) do nothing;
  end if;

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
-- fn_authorize_reassessment: add the server-side wait-period check.
-- Everything else is byte-for-byte identical to 0004's version.
-- ---------------------------------------------------------------------
create or replace function fn_authorize_reassessment(p_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_original assessments%rowtype;
  v_wait_days int;
  v_eligible_at timestamptz;
begin
  select * into v_original from assessments where id = (p_payload->>'original_assessment_id')::uuid for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_original.status <> 'FAILED' then
    return jsonb_build_object('error', 'not_failed', 'status', v_original.status);
  end if;

  select coalesce(reassessment_wait_days, 0) into v_wait_days
  from competencies where id = v_original.competency_id;

  if v_wait_days > 0 then
    v_eligible_at := coalesce(v_original.submitted_at, v_original.updated_at) + make_interval(days => v_wait_days);
    if now() < v_eligible_at then
      return jsonb_build_object(
        'error', 'reassessment_wait_period',
        'eligible_at', v_eligible_at,
        'wait_days', v_wait_days
      );
    end if;
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
-- fn_create_certificate_record: widen the guard to also accept CERTIFIED
-- (an approved result). The PASSED path is completely unchanged.
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
  v_competency competencies%rowtype;
  v_cert certificates%rowtype;
  v_valid_until timestamptz;
begin
  select * into v_assessment from assessments where id = p_assessment_id for update;

  if not found or v_assessment.status not in ('PASSED', 'CERTIFIED') then
    return jsonb_build_object('error', 'not_passed');
  end if;

  select * into v_cert from certificates where assessment_id = p_assessment_id;
  if found then
    return to_jsonb(v_cert);
  end if;

  select * into v_competency from competencies where id = v_assessment.competency_id;
  if v_competency.validity_months is not null then
    v_valid_until := now() + make_interval(months => v_competency.validity_months);
  end if;

  insert into certificates (
    assessment_id, candidate_id, competency_id, certificate_number,
    verification_code, score_percentage, valid_until
  ) values (
    p_assessment_id, v_assessment.candidate_id, v_assessment.competency_id,
    p_certificate_number, p_verification_code, v_assessment.score_percentage, v_valid_until
  )
  returning * into v_cert;

  return to_jsonb(v_cert);
end;
$$;

-- ---------------------------------------------------------------------
-- fn_approve_result / fn_reject_result: the AWAITING_APPROVAL -> CERTIFIED
-- / FAILED transitions. Both are idempotent via the unique constraint on
-- result_approvals.assessment_id and an explicit status guard.
-- ---------------------------------------------------------------------
create or replace function fn_approve_result(
  p_assessment_id uuid,
  p_decided_by uuid,
  p_comment text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_assessment assessments%rowtype;
begin
  select * into v_assessment from assessments where id = p_assessment_id for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_assessment.status <> 'AWAITING_APPROVAL' then
    return jsonb_build_object('error', 'not_awaiting_approval', 'status', v_assessment.status);
  end if;

  update assessments set status = 'CERTIFIED' where id = p_assessment_id
    returning * into v_assessment;

  insert into result_approvals (assessment_id, decision, decided_by, comment)
  values (p_assessment_id, 'approved', p_decided_by, p_comment)
  on conflict (assessment_id) do nothing;

  return to_jsonb(v_assessment);
end;
$$;

create or replace function fn_reject_result(
  p_assessment_id uuid,
  p_decided_by uuid,
  p_comment text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_assessment assessments%rowtype;
begin
  select * into v_assessment from assessments where id = p_assessment_id for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_assessment.status <> 'AWAITING_APPROVAL' then
    return jsonb_build_object('error', 'not_awaiting_approval', 'status', v_assessment.status);
  end if;

  -- Rejecting routes to FAILED so the existing reassessment flow
  -- (fn_authorize_reassessment) applies unchanged.
  update assessments set status = 'FAILED' where id = p_assessment_id
    returning * into v_assessment;

  insert into result_approvals (assessment_id, decision, decided_by, comment)
  values (p_assessment_id, 'rejected', p_decided_by, p_comment)
  on conflict (assessment_id) do nothing;

  return to_jsonb(v_assessment);
end;
$$;

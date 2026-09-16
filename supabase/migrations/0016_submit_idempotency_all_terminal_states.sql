-- =====================================================================
-- 0016_submit_idempotency_all_terminal_states.sql
-- Phase 3: fn_submit_assessment's idempotent-retry branch only recognized
-- PASSED/FAILED as "already finalized" -- a retried/duplicate submit call
-- (double-click, multi-tab, network retry) against an assessment that had
-- already moved on to AWAITING_APPROVAL or CERTIFIED (HSE result-approval
-- workflow, migration 0011/0013) fell through to the `invalid_status`
-- error branch instead of returning the same snapshot. Technical
-- assessments never reach those two statuses, so this is a pure widening.
-- =====================================================================

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

  if v_status in ('PASSED', 'FAILED', 'AWAITING_APPROVAL', 'CERTIFIED') then
    select jsonb_build_object(
      'assessment_id', a.id, 'status', a.status,
      'score_percentage', a.score_percentage, 'earned_marks', a.earned_marks,
      'available_marks', a.available_marks, 'pass_mark_used', a.pass_mark,
      'passed', (a.status in ('PASSED', 'AWAITING_APPROVAL', 'CERTIFIED'))
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

-- =====================================================================
-- 0015_bulk_import_competency_area.sql
-- Phase 2: lets the bulk import flow (Excel/CSV) optionally tag an
-- imported question to a competency_areas row (HSE only -- an omitted
-- competency_area_id behaves exactly as before, so every existing
-- technical import template/row is unaffected).
-- =====================================================================

create or replace function fn_bulk_import_questions(p_created_by uuid, p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  v_row jsonb;
  v_opt jsonb;
  v_question_id uuid;
  v_competency_id uuid;
  v_area_id uuid;
  v_sort int;
  v_count int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_competency_id := (v_row->>'competency_id')::uuid;

    if not exists (select 1 from competencies where id = v_competency_id) then
      raise exception 'Unknown competency_id %', v_row->>'competency_id';
    end if;

    if nullif(v_row->>'question_set_id', '') is not null
       and not exists (select 1 from question_sets where id = (v_row->>'question_set_id')::uuid) then
      raise exception 'Unknown question_set_id %', v_row->>'question_set_id';
    end if;

    v_area_id := nullif(v_row->>'competency_area_id', '')::uuid;
    if v_area_id is not null
       and not exists (
         select 1 from competency_areas where id = v_area_id and competency_id = v_competency_id
       ) then
      raise exception 'Unknown competency_area_id % for competency %', v_area_id, v_competency_id;
    end if;

    insert into questions (
      competency_id, competency_area_id, question_set_id, question_type, question_text,
      scenario_text, marks, difficulty, explanation_admin_only, active, created_by
    ) values (
      v_competency_id,
      v_area_id,
      nullif(v_row->>'question_set_id', '')::uuid,
      v_row->>'question_type',
      v_row->>'question_text',
      nullif(v_row->>'scenario_text', ''),
      (v_row->>'marks')::numeric,
      nullif(v_row->>'difficulty', ''),
      nullif(v_row->>'explanation_admin_only', ''),
      coalesce((v_row->>'active')::boolean, true),
      p_created_by
    )
    returning id into v_question_id;

    v_sort := 0;
    for v_opt in select * from jsonb_array_elements(v_row->'options')
    loop
      insert into question_options (question_id, option_key, option_text, is_correct, sort_order)
      values (
        v_question_id,
        v_opt->>'option_key',
        v_opt->>'option_text',
        coalesce((v_opt->>'is_correct')::boolean, false),
        v_sort
      );
      v_sort := v_sort + 1;
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

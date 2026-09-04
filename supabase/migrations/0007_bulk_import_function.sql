-- =====================================================================
-- 0007_bulk_import_function.sql
-- Atomic bulk import of questions (+ their options) from the Excel/CSV
-- import flow. All rows are inserted inside a single transaction: if any
-- row fails (bad FK, constraint violation), the entire batch rolls back
-- rather than leaving a partially-imported question bank. Row-level
-- validation (competency/set lookup, correct-answer shape, duplicates)
-- already happened in the application layer before this is called; the
-- FK existence checks here are defense-in-depth, not the primary check.
-- =====================================================================

create or replace function fn_bulk_import_questions(p_created_by uuid, p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  v_row jsonb;
  v_opt jsonb;
  v_question_id uuid;
  v_sort int;
  v_count int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if not exists (select 1 from competencies where id = (v_row->>'competency_id')::uuid) then
      raise exception 'Unknown competency_id %', v_row->>'competency_id';
    end if;

    if nullif(v_row->>'question_set_id', '') is not null
       and not exists (select 1 from question_sets where id = (v_row->>'question_set_id')::uuid) then
      raise exception 'Unknown question_set_id %', v_row->>'question_set_id';
    end if;

    insert into questions (
      competency_id, question_set_id, question_type, question_text,
      scenario_text, marks, difficulty, explanation_admin_only, active, created_by
    ) values (
      (v_row->>'competency_id')::uuid,
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

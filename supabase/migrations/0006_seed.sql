-- =====================================================================
-- 0006_seed.sql
-- Safe development seed data: default competencies, sets, system
-- settings, and a small number of clearly-labelled SAMPLE questions.
-- These sample questions are for development/testing only and are NOT
-- approved production competency content.
-- =====================================================================

-- ---------------------------------------------------------------------
-- system_settings defaults — centralizes everything the spec forbids
-- hard-coding (pass mark, branding, durations, expiry, randomization).
-- ---------------------------------------------------------------------
insert into system_settings (key, value) values
  ('branding', jsonb_build_object(
    'company_name', 'Shaher United Trading & Cont. Co.',
    'company_name_ar', 'شركة شاهر المتحدة للتجارة والمقاولات',
    'portal_name', 'Competency Assessment Portal',
    'company_prefix', 'SUTC',
    'logo_url', '/shaher-logo.png',
    'certificate_footer', 'This certificate is issued electronically and is valid without a signature.',
    'primary_accent', '#0B1F3A',
    'secondary_accent', '#C8102E'
  )),
  ('default_pass_mark', jsonb_build_object('value', 85.00)),
  ('default_durations_minutes', jsonb_build_object('options', jsonb_build_array(15, 20, 30, 45))),
  ('token_expiry_defaults', jsonb_build_object('default_hours', 72)),
  ('randomization_defaults', jsonb_build_object('randomize_questions', true, 'randomize_options', true)),
  ('verification_retry_settings', jsonb_build_object('max_attempts', 5, 'window_minutes', 15, 'lock_minutes', 15))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- competencies
-- ---------------------------------------------------------------------
insert into competencies (code, competency_name, description, pass_mark) values
  ('LOA', 'Limitation of Access', 'Assessment of engineer competency for Limit of Authority approvals.', 85.00),
  ('SFT', 'Sanction for Test', 'Assessment of engineer competency for Safe For Task certification.', 85.00),
  ('PTW', 'Permit to Work', 'Assessment of engineer competency for Permit To Work issuance/authorization.', 85.00)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- question_sets — A / B / C per competency
-- ---------------------------------------------------------------------
insert into question_sets (competency_id, set_name, description)
select c.id, s.set_name, s.set_name || ' question set for ' || c.competency_name
from competencies c
cross join (values ('Set A'), ('Set B'), ('Set C')) as s(set_name)
on conflict (competency_id, set_name) do nothing;

-- ---------------------------------------------------------------------
-- SAMPLE questions (development/testing only — NOT production content)
-- ---------------------------------------------------------------------
do $$
declare
  v_ptw_id uuid;
  v_ptw_set_a uuid;
  v_loa_id uuid;
  v_loa_set_a uuid;
  v_sft_id uuid;
  v_sft_set_a uuid;
  v_question_id uuid;
begin
  select id into v_ptw_id from competencies where code = 'PTW';
  select id into v_ptw_set_a from question_sets where competency_id = v_ptw_id and set_name = 'Set A';
  select id into v_loa_id from competencies where code = 'LOA';
  select id into v_loa_set_a from question_sets where competency_id = v_loa_id and set_name = 'Set A';
  select id into v_sft_id from competencies where code = 'SFT';
  select id into v_sft_set_a from question_sets where competency_id = v_sft_id and set_name = 'Set A';

  -- PTW sample 1 — single answer
  insert into questions (competency_id, question_set_id, question_type, question_text, marks, difficulty, explanation_admin_only)
  values (v_ptw_id, v_ptw_set_a, 'single', '[SAMPLE] Before signing a Permit To Work, who is primarily responsible for verifying isolation of the equipment?', 1, 'medium', '[SAMPLE] The Permit Issuer/Authorized Person must verify isolations before authorizing work.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'The Permit Issuer / Authorized Person', true, 1),
    (v_question_id, 'B', 'The contractor''s site labourer', false, 2),
    (v_question_id, 'C', 'Any nearby employee', false, 3),
    (v_question_id, 'D', 'The security guard on duty', false, 4);

  -- PTW sample 2 — true/false
  insert into questions (competency_id, question_set_id, question_type, question_text, marks, difficulty, explanation_admin_only)
  values (v_ptw_id, v_ptw_set_a, 'true_false', '[SAMPLE] A Permit To Work can remain valid indefinitely once issued, regardless of shift changes.', 1, 'easy', '[SAMPLE] Permits are time-bound and must be revalidated at shift changes.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'True', false, 1),
    (v_question_id, 'B', 'False', true, 2);

  -- PTW sample 3 — multiple correct, scenario-based
  insert into questions (competency_id, question_set_id, question_type, question_text, scenario_text, marks, difficulty, explanation_admin_only)
  values (v_ptw_id, v_ptw_set_a, 'multiple',
    '[SAMPLE] Which of the following must be checked before hot work begins in the described area?',
    '[SAMPLE SCENARIO] A technician is preparing to carry out welding work near a process area that recently handled flammable material.',
    2, 'hard',
    '[SAMPLE] Gas testing, fire watch, and removal of combustibles are all required before hot work in this scenario.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'Gas test for flammable atmosphere', true, 1),
    (v_question_id, 'B', 'Fire watch is posted', true, 2),
    (v_question_id, 'C', 'Combustible materials removed from the area', true, 3),
    (v_question_id, 'D', 'Painting of nearby handrails', false, 4);

  -- LOA sample — single answer
  insert into questions (competency_id, question_set_id, question_type, question_text, marks, difficulty, explanation_admin_only)
  values (v_loa_id, v_loa_set_a, 'single', '[SAMPLE] A Limit of Authority defines which of the following?', 1, 'easy', '[SAMPLE] LOA defines the boundaries of decision-making authority delegated to a role.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'The maximum financial/technical decision authority delegated to a role', true, 1),
    (v_question_id, 'B', 'The physical boundary of the worksite', false, 2),
    (v_question_id, 'C', 'The list of approved vendors', false, 3),
    (v_question_id, 'D', 'The company holiday calendar', false, 4);

  -- LOA sample — true/false
  insert into questions (competency_id, question_set_id, question_type, question_text, marks, difficulty, explanation_admin_only)
  values (v_loa_id, v_loa_set_a, 'true_false', '[SAMPLE] Authority under an LOA can be informally delegated further without documented approval.', 1, 'medium', '[SAMPLE] Further delegation requires documented approval; informal delegation is not acceptable.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'True', false, 1),
    (v_question_id, 'B', 'False', true, 2);

  -- SFT sample — single answer
  insert into questions (competency_id, question_set_id, question_type, question_text, marks, difficulty, explanation_admin_only)
  values (v_sft_id, v_sft_set_a, 'single', '[SAMPLE] "Safe For Task" certification primarily confirms what about a worker?', 1, 'easy', '[SAMPLE] SFT confirms the worker is fit, trained, and competent for the specific task assigned.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'They are fit, trained and competent for the specific task', true, 1),
    (v_question_id, 'B', 'They have completed general company orientation only', false, 2),
    (v_question_id, 'C', 'They own the required PPE', false, 3),
    (v_question_id, 'D', 'They have worked at the company for over a year', false, 4);

  -- SFT sample — true/false
  insert into questions (competency_id, question_set_id, question_type, question_text, marks, difficulty, explanation_admin_only)
  values (v_sft_id, v_sft_set_a, 'true_false', '[SAMPLE] A fatigue or fitness concern raised on the day of work can invalidate a Safe For Task assessment for that shift.', 1, 'medium', '[SAMPLE] Fitness for duty is assessed per shift; a same-day concern can invalidate SFT for that shift.')
  returning id into v_question_id;
  insert into question_options (question_id, option_key, option_text, is_correct, sort_order) values
    (v_question_id, 'A', 'True', true, 1),
    (v_question_id, 'B', 'False', false, 2);

end $$;

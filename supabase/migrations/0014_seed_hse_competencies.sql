-- =====================================================================
-- 0014_seed_hse_competencies.sql
-- Seeds the two HSE competency rows (HSE Advisor, HSE Manager) and their
-- Set A/B/C question sets, mirroring the existing LOA/SFT/PTW pattern
-- from 0006_seed.sql.
--
-- Both rows are created with active = false. They are intentionally kept
-- invisible to the existing "Create Assessment" competency picker and
-- other active-only queries until Phase 2 admin tooling (competency-area
-- manager, question bank entry, assessment-set configuration) is in
-- place and the question bank actually has content — flipping
-- `active = true` is the last step of Phase 2, not something to do now.
--
-- NOT included here: the ~34 (HSE Advisor) / ~35 (HSE Manager) individual
-- competency_areas rows. The exact named list from the original spec
-- was not available to generate this migration and must come from the
-- user (or be entered via the admin Competency Areas Manager built in
-- Phase 2) rather than be guessed at for a real certification framework.
--
-- Default config values below (pass_mark, amber_threshold,
-- reassessment_wait_days) are reasonable starting points, not fixed --
-- every one of them is a plain editable column an admin can change per
-- the "admin-configurable" requirement in the proposal.
-- =====================================================================

insert into competencies (
  code, competency_name, description, pass_mark, active,
  stream, amber_threshold, validity_months, reassessment_wait_days, requires_result_approval
) values
  (
    'HSE_ADV', 'HSE Advisor', 'HSE Advisor competency assessment track.',
    85.00, false,
    'hse', 70.00, 6, 3, true
  ),
  (
    'HSE_MGR', 'HSE Manager', 'HSE Manager competency assessment track.',
    85.00, false,
    'hse', 70.00, 6, 3, true
  )
on conflict (code) do nothing;

insert into question_sets (competency_id, set_name, description)
select c.id, s.set_name, s.set_name || ' question set for ' || c.competency_name
from competencies c
cross join (values ('Set A'), ('Set B'), ('Set C')) as s(set_name)
where c.code in ('HSE_ADV', 'HSE_MGR')
on conflict (competency_id, set_name) do nothing;

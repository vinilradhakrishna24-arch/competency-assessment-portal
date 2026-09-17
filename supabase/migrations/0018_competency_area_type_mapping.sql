-- Adds the "Competency Type" (Knowledge / Skill) classification to
-- competency_areas. This is the single source of truth for Competency Type
-- going forward -- bulk upload, manual question create/edit, the Question
-- Bank UI, Create Assessment, and reporting must all derive Competency Type
-- by joining questions.competency_area_id -> competency_areas.competency_type
-- rather than storing it redundantly on the question row itself.
--
-- Critical: Competency Type is per (competency_id, element), NOT per element
-- name alone. competency_areas already has one row PER (competency, element)
-- pair (e.g. "Leadership and Commitment" exists as two separate rows -- one
-- under HSE Advisor, one under HSE Manager) so adding the column here and
-- setting it independently per row is exactly correct: the same element can
-- be Knowledge for one competency and Skill for the other.
--
-- This is purely additive: no existing rows are deleted or renamed, no ids
-- change, and (per live data as of this migration) zero questions currently
-- reference any competency_area_id, so there is nothing to backfill or break
-- on the questions side.

alter table public.competency_areas
  add column competency_type text
    check (competency_type is null or competency_type in ('knowledge', 'skill'));

comment on column public.competency_areas.competency_type is
  'Knowledge or Skill classification of this (competency, element) pair. This is the single source of truth -- never re-derive or hard-code this mapping elsewhere. NULL only for legacy/technical rows that predate this classification (none exist for HSE today).';

-- --------------------------------------------------------------------
-- HSE Advisor (22bbf8a7-e224-429a-b5f4-d4036d728898): Skill = 5 elements
-- (Actions to Address Risks and Opportunities, Hazard Identification and
-- Assessment of Risks, HSE Communication, Monitoring/Measurement/Analysis &
-- Performance Evaluation, Audit & Inspection). All other 17 = Knowledge.
-- --------------------------------------------------------------------
update public.competency_areas
set competency_type = 'skill'
where competency_id = '22bbf8a7-e224-429a-b5f4-d4036d728898'
  and code in ('A07', 'A08', 'A11', 'A15', 'A16');

update public.competency_areas
set competency_type = 'knowledge'
where competency_id = '22bbf8a7-e224-429a-b5f4-d4036d728898'
  and code not in ('A07', 'A08', 'A11', 'A15', 'A16');

-- --------------------------------------------------------------------
-- HSE Manager (9148c08d-ecd3-4169-9ccd-241181e622fd): Knowledge = 6 elements
-- (HSE Basics and Definitions, HSE Policies, Determination of Legal and
-- Other Requirements, Documented Information, Environmental Management,
-- Occupational Health). All other 16 = Skill.
-- --------------------------------------------------------------------
update public.competency_areas
set competency_type = 'knowledge'
where competency_id = '9148c08d-ecd3-4169-9ccd-241181e622fd'
  and code in ('A01', 'A04', 'A09', 'A12', 'A17', 'A18');

update public.competency_areas
set competency_type = 'skill'
where competency_id = '9148c08d-ecd3-4169-9ccd-241181e622fd'
  and code not in ('A01', 'A04', 'A09', 'A12', 'A17', 'A18');

-- Both HSE competencies have exactly 22 elements today and every row must
-- now be classified -- fail loudly at migration time (rather than silently
-- shipping an unmapped row) if that assumption is ever violated.
do $$
declare
  v_unmapped int;
begin
  select count(*) into v_unmapped
  from public.competency_areas
  where competency_id in ('22bbf8a7-e224-429a-b5f4-d4036d728898', '9148c08d-ecd3-4169-9ccd-241181e622fd')
    and competency_type is null;

  if v_unmapped > 0 then
    raise exception 'competency_area_type_mapping: % HSE competency_areas row(s) left unmapped', v_unmapped;
  end if;
end $$;

-- Going forward, every HSE competency_areas row must declare its type (the
-- Settings > Competency Areas UI and createCompetencyArea/updateCompetencyArea
-- now require it). Technical competencies never populate competency_areas at
-- all, so this NOT NULL has no effect on them.
alter table public.competency_areas
  alter column competency_type set not null;

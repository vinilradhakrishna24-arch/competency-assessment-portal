-- =====================================================================
-- 0011_hse_competency_streams.sql
-- Additive schema foundation for the HSE Competency Management module
-- (HSE Advisor + HSE Manager tracks, alongside the existing LOA/SFT/PTW
-- technical tracks, in the same portal/database).
--
-- Every change here is additive: new tables, or nullable columns / safe
-- defaults on existing tables. Nothing is dropped, renamed, or made NOT
-- NULL on data that already has rows. The new competencies columns all
-- default to values that reproduce today's technical-stream behavior
-- exactly (stream='technical', reassessment_wait_days=0,
-- requires_result_approval=false, amber_threshold/validity_months=null),
-- so LOA/SFT/PTW are byte-for-byte unaffected by this migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- competencies: stream + HSE-only config columns
-- ---------------------------------------------------------------------
alter table competencies add column if not exists stream text not null default 'technical' check (stream in ('technical', 'hse'));
alter table competencies add column if not exists amber_threshold numeric(5,2) check (amber_threshold is null or (amber_threshold > 0 and amber_threshold <= 100));
alter table competencies add column if not exists validity_months int check (validity_months is null or validity_months > 0);
alter table competencies add column if not exists reassessment_wait_days int not null default 0 check (reassessment_wait_days >= 0);
alter table competencies add column if not exists requires_result_approval boolean not null default false;

comment on column competencies.stream is 'technical (LOA/SFT/PTW, existing) or hse (new). Drives which nav section, dashboard and question bank a competency belongs to.';
comment on column competencies.amber_threshold is 'HSE only. score >= pass_mark => green, amber_threshold <= score < pass_mark => amber, score < amber_threshold => red. NULL (the default, and always true for technical) disables RAG banding entirely for that competency.';
comment on column competencies.validity_months is 'HSE only. certificates.valid_until = issued_at + validity_months. NULL means certificates for this competency never expire (current technical behavior, unchanged).';
comment on column competencies.reassessment_wait_days is 'Minimum days after a FAILED attempt before it can be reassessed. Enforced server-side in fn_authorize_reassessment. Defaults to 0 so existing technical reassessment behavior (no wait) is unchanged.';
comment on column competencies.requires_result_approval is 'When true, a passing score routes to AWAITING_APPROVAL instead of auto-issuing a certificate immediately. Defaults to false so existing technical certificates keep auto-issuing exactly as today.';

-- Explicit for clarity/idempotency (the column default already covers this).
update competencies set stream = 'technical' where code in ('LOA', 'SFT', 'PTW');

-- ---------------------------------------------------------------------
-- competency_areas — the sub-topic dimension used to tag questions and
-- break scores down (e.g. HSE Advisor's ~34 / HSE Manager's ~35 areas).
-- Every reference to it elsewhere is nullable, so technical
-- questions/exams (which never set it) are entirely unaffected.
-- ---------------------------------------------------------------------
create table if not exists competency_areas (
  id             uuid primary key default gen_random_uuid(),
  competency_id  uuid not null references competencies(id) on delete cascade,
  code           text not null,
  area_name      text not null,
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competency_id, code)
);

create index if not exists idx_competency_areas_competency on competency_areas(competency_id);

drop trigger if exists trg_competency_areas_updated_at on competency_areas;
create trigger trg_competency_areas_updated_at
  before update on competency_areas
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- questions / assessment_questions: nullable competency-area tag
-- (+ frozen snapshot, same invariant as every other *_snapshot column).
-- ---------------------------------------------------------------------
alter table questions add column if not exists competency_area_id uuid references competency_areas(id);
create index if not exists idx_questions_competency_area on questions(competency_area_id);

alter table assessment_questions add column if not exists competency_area_id_snapshot uuid references competency_areas(id);

-- ---------------------------------------------------------------------
-- assessment_area_scores — per-area RAG breakdown, written once at
-- finalization time alongside `results` (see 0013). Only populated when
-- the competency has amber_threshold set (HSE); never written for
-- technical competencies.
-- ---------------------------------------------------------------------
create table if not exists assessment_area_scores (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null references assessments(id) on delete cascade,
  competency_area_id  uuid not null references competency_areas(id),
  earned_marks        numeric(10,2) not null,
  available_marks     numeric(10,2) not null,
  score_percentage    numeric(8,4) not null,
  band                text not null check (band in ('green', 'amber', 'red')),
  unique (assessment_id, competency_area_id)
);

create index if not exists idx_assessment_area_scores_assessment on assessment_area_scores(assessment_id);

-- ---------------------------------------------------------------------
-- certificates: validity window (HSE only — null means "never expires",
-- the current behavior for every existing LOA/SFT/PTW certificate).
-- ---------------------------------------------------------------------
alter table certificates add column if not exists valid_until timestamptz;

-- ---------------------------------------------------------------------
-- candidates: location (requested field, applies to both streams).
-- ---------------------------------------------------------------------
alter table candidates add column if not exists location text;

-- ---------------------------------------------------------------------
-- assessments.status: widen to add the result-approval states. Every
-- existing row's status is already within the old set, so this is a pure
-- widening — nothing reaches AWAITING_APPROVAL/CERTIFIED until
-- fn_finalize_assessment (updated in 0013) starts branching on
-- requires_result_approval for a competency that opts into it.
-- ---------------------------------------------------------------------
alter table assessments drop constraint if exists assessments_status_check;
alter table assessments add constraint assessments_status_check check (status in (
  'DRAFT', 'PENDING', 'STARTED', 'SUBMITTED',
  'PASSED', 'FAILED', 'EXPIRED', 'CANCELLED',
  'AWAITING_APPROVAL', 'CERTIFIED'
));

-- ---------------------------------------------------------------------
-- result_approvals — audit trail for the manual approve/reject decision
-- on an AWAITING_APPROVAL assessment (see fn_approve_result /
-- fn_reject_result in 0013).
-- ---------------------------------------------------------------------
create table if not exists result_approvals (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null unique references assessments(id) on delete cascade,
  decision        text not null check (decision in ('approved', 'rejected')),
  decided_by      uuid references profiles(id),
  decided_at      timestamptz not null default now(),
  comment         text
);

create index if not exists idx_result_approvals_assessment on result_approvals(assessment_id);

-- ---------------------------------------------------------------------
-- RLS: enable + policies for every new table, mirroring the existing
-- pattern exactly (viewer+admin read, admin write on master data;
-- assessment-lifecycle tables server-only via the service role).
-- ---------------------------------------------------------------------
alter table competency_areas enable row level security;
alter table assessment_area_scores enable row level security;
alter table result_approvals enable row level security;

create policy competency_areas_select on competency_areas for select
  using (is_viewer_or_admin());
create policy competency_areas_admin_insert on competency_areas for insert with check (is_admin());
create policy competency_areas_admin_update on competency_areas for update using (is_admin());
create policy competency_areas_admin_delete on competency_areas for delete using (is_admin());

create policy assessment_area_scores_select on assessment_area_scores for select
  using (is_viewer_or_admin());
-- no client write policies -- written only by fn_finalize_assessment via the service role, mirroring `results`.

create policy result_approvals_select on result_approvals for select
  using (is_viewer_or_admin());
-- no client write policies -- written only by fn_approve_result/fn_reject_result via the service role.

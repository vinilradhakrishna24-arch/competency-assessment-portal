-- =====================================================================
-- 0012_role_stream_scope.sql
-- Splits the hardcoded roles.name enum into a stable permission_level
-- column (what RLS actually keys off) plus a free-form display name, and
-- adds an optional stream_scope so a read-only role can be restricted to
-- one competency stream (e.g. HSE Manager must never see technical
-- LOA/SFT/PTW data — decision #4 of the HSE module proposal).
--
-- Existing admin/viewer behavior is byte-for-byte unchanged:
-- permission_level is backfilled from name, both RLS helper functions are
-- re-keyed to read permission_level instead of name (mapping straight
-- through for the two existing roles), and stream_scope defaults to NULL
-- (= unrestricted) for every existing role row. Nothing about how the
-- current Admin or Viewer account behaves changes as a result of this
-- migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- permission_level: the real RLS key going forward. `name` remains a
-- unique display label so new roles ("HSE Manager", "QHSE Manager",
-- "HSE Lead", ...) can be created later without touching a check
-- constraint or redeploying.
-- ---------------------------------------------------------------------
alter table roles add column if not exists permission_level text;
update roles set permission_level = name where permission_level is null;
alter table roles alter column permission_level set not null;
alter table roles add constraint roles_permission_level_check check (permission_level in ('admin', 'viewer'));

alter table roles drop constraint if exists roles_name_check;
-- `name` keeps its existing UNIQUE constraint (roles_name_key, from 0001) --
-- it just no longer has to be one of exactly two literal values.

-- ---------------------------------------------------------------------
-- stream_scope: NULL = unrestricted (sees every competency stream) --
-- the default, and the exact current behavior for every existing Admin
-- and Viewer account. A non-null array (e.g. {hse}) restricts a
-- viewer-level role to only those streams, enforced in RLS below.
-- ---------------------------------------------------------------------
alter table roles add column if not exists stream_scope text[];

comment on column roles.permission_level is 'admin | viewer -- the actual RLS/authorization key. `name` is now just a display label and can be any unique string (e.g. "HSE Manager").';
comment on column roles.stream_scope is 'NULL = unrestricted (sees every competency stream -- current behavior for Admin and the original Viewer role). A non-null array (e.g. {hse}) restricts a viewer-level role to only those streams.';

-- ---------------------------------------------------------------------
-- Re-key the RLS helper functions to permission_level. Behavior for the
-- two existing roles is identical -- 'admin' and 'viewer' map straight
-- through unchanged -- this only matters for a *new* role that has a
-- different display name but permission_level = 'viewer'.
-- ---------------------------------------------------------------------
create or replace function auth_permission_level(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.permission_level
  from profiles p
  join roles r on r.id = p.role_id
  where p.id = p_user_id
    and p.active = true
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_permission_level(auth.uid()) = 'admin', false)
$$;

create or replace function is_viewer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_permission_level(auth.uid()) in ('admin', 'viewer'), false)
$$;

-- auth_role_name() (0001) is left in place, unchanged, for any call site
-- that wants the free-form display name -- it no longer doubles as the
-- permission key, permission_level does.

-- ---------------------------------------------------------------------
-- Stream-scope helper: the set of streams a caller's role is limited to,
-- or NULL for unrestricted. Admin is always unrestricted as a safety
-- backstop, regardless of what happens to be configured on its role row.
-- ---------------------------------------------------------------------
create or replace function viewer_stream_scope(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_permission_level(p_user_id) = 'admin' then null
    else r.stream_scope
  end
  from profiles p
  join roles r on r.id = p.role_id
  where p.id = p_user_id
    and p.active = true
$$;

-- ---------------------------------------------------------------------
-- Seed the HSE Manager role. permission_level='viewer' -> same baseline
-- privileges as today's Viewer (read-only); stream_scope={hse} -> RLS
-- below hides every technical (LOA/SFT/PTW) row from it. Inert until a
-- user account is actually assigned this role (Phase 5).
-- ---------------------------------------------------------------------
insert into roles (name, description, permission_level, stream_scope)
values (
  'HSE Manager',
  'HSE Manager / Management Viewer - read-only access scoped to HSE Competency only (Advisor + Manager tracks). Cannot see Technical (LOA/SFT/PTW) data.',
  'viewer',
  array['hse']
)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Stream-scoped RLS. Pattern: admin always passes; a viewer-level caller
-- passes if their stream_scope is null (unrestricted -- every existing
-- viewer today) OR the row's competency is in their allowed streams.
-- Only SELECT policies change -- write access was already admin-only on
-- every one of these tables.
-- ---------------------------------------------------------------------

-- competencies: the stream column lives on the table itself.
drop policy if exists competencies_select on competencies;
create policy competencies_select on competencies for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or stream = any(viewer_stream_scope(auth.uid()))
    ))
  );

-- question_sets: has competency_id directly.
drop policy if exists question_sets_select on question_sets;
create policy question_sets_select on question_sets for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from competencies c
        where c.id = question_sets.competency_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- questions: has competency_id directly.
drop policy if exists questions_select on questions;
create policy questions_select on questions for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from competencies c
        where c.id = questions.competency_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- question_options: join through questions.competency_id.
drop policy if exists question_options_select on question_options;
create policy question_options_select on question_options for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from questions q
        join competencies c on c.id = q.competency_id
        where q.id = question_options.question_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- competency_areas: has competency_id directly (table + policy added in 0011).
drop policy if exists competency_areas_select on competency_areas;
create policy competency_areas_select on competency_areas for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from competencies c
        where c.id = competency_areas.competency_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- assessments: has competency_id directly.
drop policy if exists assessments_select on assessments;
create policy assessments_select on assessments for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from competencies c
        where c.id = assessments.competency_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- results: join through assessments.competency_id.
drop policy if exists results_select on results;
create policy results_select on results for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from assessments a
        join competencies c on c.id = a.competency_id
        where a.id = results.assessment_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- certificates: has competency_id directly.
drop policy if exists certificates_select on certificates;
create policy certificates_select on certificates for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from competencies c
        where c.id = certificates.competency_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- assessment_area_scores: join through assessments.competency_id
-- (table + policy added in 0011).
drop policy if exists assessment_area_scores_select on assessment_area_scores;
create policy assessment_area_scores_select on assessment_area_scores for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from assessments a
        join competencies c on c.id = a.competency_id
        where a.id = assessment_area_scores.assessment_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- result_approvals: join through assessments.competency_id
-- (table + policy added in 0011).
drop policy if exists result_approvals_select on result_approvals;
create policy result_approvals_select on result_approvals for select
  using (
    is_admin()
    or (is_viewer_or_admin() and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from assessments a
        join competencies c on c.id = a.competency_id
        where a.id = result_approvals.assessment_id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

-- candidates: NOT itself stream-owned -- a candidate can hold both a
-- technical and an HSE assessment. A stream-scoped viewer sees a
-- candidate only if that candidate has at least one assessment in an
-- allowed stream. Preserves the existing admin-bypass-soft-delete shape
-- from 0009 exactly; only the added stream clause is new.
drop policy if exists candidates_select on candidates;
create policy candidates_select on candidates for select
  using (
    is_admin()
    or (is_viewer_or_admin() and deleted_at is null and (
      viewer_stream_scope(auth.uid()) is null
      or exists (
        select 1 from assessments a
        join competencies c on c.id = a.competency_id
        where a.candidate_id = candidates.id
          and c.stream = any(viewer_stream_scope(auth.uid()))
      )
    ))
  );

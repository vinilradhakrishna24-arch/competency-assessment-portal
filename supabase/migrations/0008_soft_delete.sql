-- =====================================================================
-- 0008_soft_delete.sql
-- Adds soft-delete ("archive") support for candidates and users
-- (profiles). Hard DELETE is unsafe for both: assessments, audit_logs,
-- and questions all reference profiles/candidates without ON DELETE
-- CASCADE/SET NULL, so a hard delete on any record with history fails
-- (or would silently orphan audit trail data if the FKs were loosened).
-- Soft-delete instead: hide from active lists, block further access,
-- keep all historical/audit data intact.
-- =====================================================================

alter table candidates add column if not exists deleted_at timestamptz;
alter table profiles add column if not exists deleted_at timestamptz;

create index if not exists idx_candidates_deleted_at on candidates(deleted_at);
create index if not exists idx_profiles_deleted_at on profiles(deleted_at);

-- candidates.employee_id was globally unique; once a candidate can be
-- soft-deleted, a *new* candidate re-using that employee_id must still be
-- allowed (the old row is archived, not truly gone). Replace the blanket
-- unique constraint with a partial unique index over active rows only.
alter table candidates drop constraint if exists candidates_employee_id_key;
create unique index if not exists idx_candidates_employee_id_active_unique
  on candidates(employee_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- RLS: soft-deleted rows should behave as if they don't exist for
-- everyone except the delete action itself (which uses the service-role
-- client). Tighten the existing select policies rather than adding new
-- ones, so every existing read path (dashboard, tables, reports,
-- candidate lookup for exam links) is covered automatically.
-- ---------------------------------------------------------------------
drop policy if exists candidates_select on candidates;
create policy candidates_select on candidates for select
  using (is_viewer_or_admin() and deleted_at is null);

-- profiles_select_self_or_admin already restricts to self-or-admin; add
-- the deleted_at guard so a deactivated *and* deleted admin's own old
-- session can't still see their profile row, and admins don't see
-- deleted users in user-management queries.
drop policy if exists profiles_select_self_or_admin on profiles;
create policy profiles_select_self_or_admin on profiles for select
  using ((id = auth.uid() or is_admin()) and deleted_at is null);

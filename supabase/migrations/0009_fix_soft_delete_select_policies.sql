-- =====================================================================
-- 0009_fix_soft_delete_select_policies.sql
-- Fixes a bug that made deleteCandidate()/deleteUser() fail with
-- "new row violates row-level security policy" whenever an admin tried
-- to soft-delete a row.
--
-- Root cause: 0008_soft_delete.sql tightened candidates_select and
-- profiles_select_self_or_admin to `... and deleted_at is null` for
-- EVERYONE, admins included. Postgres RLS requires the row produced by
-- an UPDATE to still satisfy the table's SELECT policy for the acting
-- role; since setting deleted_at made the row invisible even to the
-- admin performing the update, Postgres rejected the UPDATE outright
-- (no WITH CHECK override on the UPDATE policy can bypass this -- the
-- SELECT policy is enforced independently).
--
-- Fix: give admins an unconditional bypass in both SELECT policies so
-- they can always see (and therefore soft-delete) a row regardless of
-- deleted_at, while non-admin viewers/self-view remain restricted to
-- non-deleted rows exactly as before.
-- =====================================================================

drop policy if exists candidates_select on candidates;
create policy candidates_select on candidates for select
  using (is_admin() or (is_viewer_or_admin() and deleted_at is null));

drop policy if exists profiles_select_self_or_admin on profiles;
create policy profiles_select_self_or_admin on profiles for select
  using (is_admin() or (id = auth.uid() and deleted_at is null));

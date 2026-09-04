-- =====================================================================
-- 0005_rls_and_storage.sql
-- Row Level Security on every table + the private certificates bucket.
--
-- Design:
--  - Admin/Viewer are real Supabase Auth users -> RLS keyed off auth.uid().
--  - Candidates NEVER authenticate with Supabase Auth. All candidate exam
--    operations go through Next.js server routes using the service-role
--    key, which bypasses RLS by design. RLS below therefore has no
--    policies granting the anonymous/authenticated-without-profile
--    caller any access to exam data — the default is deny.
--  - Viewer gets SELECT-only policies everywhere; only Admin gets
--    INSERT/UPDATE/DELETE, and only on master-data tables. Assessment
--    lifecycle tables (assessments/assessment_questions/answers/results/
--    certificates) have no direct client write policies at all — every
--    mutation happens server-side via the fn_* RPCs using the
--    service-role key, after an application-level role check.
-- =====================================================================

-- Auto-create a placeholder profile whenever a new auth user is provisioned,
-- so an admin invite can never leave an orphaned auth user with no profile
-- row (defense in depth around the two-step "create auth user, then create
-- profile" admin flow).
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_role_id uuid;
begin
  select id into v_viewer_role_id from roles where name = 'viewer';

  insert into profiles (id, full_name, email, role_id, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role_id')::uuid, v_viewer_role_id),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table roles enable row level security;
alter table profiles enable row level security;
alter table candidates enable row level security;
alter table competencies enable row level security;
alter table question_sets enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table system_settings enable row level security;
alter table sequence_counters enable row level security;
alter table assessments enable row level security;
alter table assessment_questions enable row level security;
alter table answers enable row level security;
alter table results enable row level security;
alter table certificates enable row level security;
alter table audit_logs enable row level security;
alter table verification_attempts enable row level security;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
create policy roles_select on roles for select
  using (is_viewer_or_admin());

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_self_or_admin on profiles for select
  using (id = auth.uid() or is_admin());

create policy profiles_admin_write on profiles for insert
  with check (is_admin());

create policy profiles_admin_update on profiles for update
  using (is_admin());

create policy profiles_admin_delete on profiles for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- candidates — admin + viewer read, admin write
-- ---------------------------------------------------------------------
create policy candidates_select on candidates for select
  using (is_viewer_or_admin());

create policy candidates_admin_insert on candidates for insert
  with check (is_admin());

create policy candidates_admin_update on candidates for update
  using (is_admin());

create policy candidates_admin_delete on candidates for delete
  using (is_admin());

-- ---------------------------------------------------------------------
-- competencies / question_sets / questions / question_options
-- ---------------------------------------------------------------------
create policy competencies_select on competencies for select
  using (is_viewer_or_admin());
create policy competencies_admin_insert on competencies for insert with check (is_admin());
create policy competencies_admin_update on competencies for update using (is_admin());
create policy competencies_admin_delete on competencies for delete using (is_admin());

create policy question_sets_select on question_sets for select
  using (is_viewer_or_admin());
create policy question_sets_admin_insert on question_sets for insert with check (is_admin());
create policy question_sets_admin_update on question_sets for update using (is_admin());
create policy question_sets_admin_delete on question_sets for delete using (is_admin());

create policy questions_select on questions for select
  using (is_viewer_or_admin());
create policy questions_admin_insert on questions for insert with check (is_admin());
create policy questions_admin_update on questions for update using (is_admin());
create policy questions_admin_delete on questions for delete using (is_admin());

create policy question_options_select on question_options for select
  using (is_viewer_or_admin());
create policy question_options_admin_insert on question_options for insert with check (is_admin());
create policy question_options_admin_update on question_options for update using (is_admin());
create policy question_options_admin_delete on question_options for delete using (is_admin());

-- ---------------------------------------------------------------------
-- system_settings — admin only, in both directions
-- ---------------------------------------------------------------------
create policy system_settings_select on system_settings for select
  using (is_admin());
create policy system_settings_admin_write on system_settings for insert with check (is_admin());
create policy system_settings_admin_update on system_settings for update using (is_admin());

-- sequence_counters: no client policies at all -> only the service role
-- (which bypasses RLS) can touch it.

-- ---------------------------------------------------------------------
-- assessments and everything downstream of it — READ ONLY for
-- admin/viewer via the client. All writes happen server-side through the
-- service role after an explicit role check in the API route.
-- ---------------------------------------------------------------------
create policy assessments_select on assessments for select
  using (is_viewer_or_admin());

create policy assessment_questions_select on assessment_questions for select
  using (is_admin()); -- contains correct_option_ids; viewers never need this

create policy answers_select on answers for select
  using (is_admin());

create policy results_select on results for select
  using (is_viewer_or_admin());

create policy certificates_select on certificates for select
  using (is_viewer_or_admin());

create policy audit_logs_select on audit_logs for select
  using (is_admin());

-- verification_attempts: no client policies -> service role only.

-- ---------------------------------------------------------------------
-- Storage: private "certificates" bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

-- No storage.objects policies are created for the anon/authenticated
-- roles on this bucket — it is intentionally unreadable by any client.
-- Admin/Viewer download certificates through a server route that uses
-- the service role to mint a short-lived signed URL, and candidates
-- download through the token-authenticated exam API the same way.

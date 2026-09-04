-- =====================================================================
-- 0001_extensions_and_roles.sql
-- Extensions, roles, profiles (internal Admin/Examiner + Viewer users)
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid(), digest()
create extension if not exists "pg_trgm";    -- fuzzy search on names

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (name in ('admin', 'viewer')),
  description text,
  created_at  timestamptz not null default now()
);

insert into roles (name, description) values
  ('admin', 'Admin / Examiner - full control over candidates, assessments, question bank and settings'),
  ('viewer', 'Viewer / Management - read-only access to dashboard, results, reports and certificates')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role_id     uuid not null references roles(id),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_profiles_role_id on profiles(role_id);

-- Helper: fetch the role name of a given user id (used throughout RLS policies)
create or replace function auth_role_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
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
  select coalesce(auth_role_name(auth.uid()) = 'admin', false)
$$;

create or replace function is_viewer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role_name(auth.uid()) in ('admin', 'viewer'), false)
$$;

-- keep profiles.updated_at fresh
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

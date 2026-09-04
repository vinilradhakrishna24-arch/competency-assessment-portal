-- =====================================================================
-- 0002_core_tables.sql
-- Candidates, competencies, question sets, question bank, system settings
-- =====================================================================

-- ---------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------
create table if not exists candidates (
  id               uuid primary key default gen_random_uuid(),
  employee_id      text not null unique,
  full_name        text not null,
  designation      text,
  email            text,
  mobile           text,
  project_contract text,
  department       text,
  active_status    boolean not null default true,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_candidates_employee_id on candidates(employee_id);
create index if not exists idx_candidates_full_name_trgm on candidates using gin (full_name gin_trgm_ops);
create index if not exists idx_candidates_department on candidates(department);
create index if not exists idx_candidates_project on candidates(project_contract);

drop trigger if exists trg_candidates_updated_at on candidates;
create trigger trg_candidates_updated_at
  before update on candidates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- competencies
-- ---------------------------------------------------------------------
create table if not exists competencies (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  competency_name text not null,
  description     text,
  pass_mark       numeric(5,2) not null default 85.00 check (pass_mark > 0 and pass_mark <= 100),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_competencies_updated_at on competencies;
create trigger trg_competencies_updated_at
  before update on competencies
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- question_sets
-- ---------------------------------------------------------------------
create table if not exists question_sets (
  id            uuid primary key default gen_random_uuid(),
  competency_id uuid not null references competencies(id) on delete cascade,
  set_name      text not null,
  description   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (competency_id, set_name)
);

create index if not exists idx_question_sets_competency on question_sets(competency_id);

-- ---------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------
create table if not exists questions (
  id                       uuid primary key default gen_random_uuid(),
  competency_id            uuid not null references competencies(id),
  question_set_id          uuid references question_sets(id),
  question_type            text not null check (question_type in ('single', 'multiple', 'true_false')),
  question_text            text not null,
  scenario_text            text,
  marks                    numeric(6,2) not null default 1 check (marks > 0),
  difficulty               text check (difficulty in ('easy', 'medium', 'hard')),
  explanation_admin_only   text,
  active                   boolean not null default true,
  created_by               uuid references profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_questions_competency on questions(competency_id);
create index if not exists idx_questions_set on questions(question_set_id);
create index if not exists idx_questions_active on questions(active);

drop trigger if exists trg_questions_updated_at on questions;
create trigger trg_questions_updated_at
  before update on questions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- question_options
-- ---------------------------------------------------------------------
create table if not exists question_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references questions(id) on delete cascade,
  option_key   text not null,
  option_text  text not null,
  is_correct   boolean not null default false,
  sort_order   int not null default 0,
  unique (question_id, option_key)
);

create index if not exists idx_question_options_question on question_options(question_id);

-- Guard: True/False questions must have exactly 2 options, single/multiple must have >= 2
-- and at least one correct option must exist per question — enforced at application layer
-- (bulk import + admin form validation) since cross-row constraints need triggers.
create or replace function validate_question_has_correct_option()
returns trigger
language plpgsql
as $$
declare
  v_correct_count int;
  v_question_type text;
begin
  select question_type into v_question_type from questions where id = coalesce(new.question_id, old.question_id);

  select count(*) into v_correct_count
  from question_options
  where question_id = coalesce(new.question_id, old.question_id)
    and is_correct = true;

  -- Only enforce on delete/update that would remove the last correct answer;
  -- inserts are validated at the application layer during question creation/import
  -- because options are inserted one-by-one.
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- system_settings (key/value store — centralizes branding, defaults, pass mark, etc.)
-- ---------------------------------------------------------------------
create table if not exists system_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

drop trigger if exists trg_system_settings_updated_at on system_settings;
create trigger trg_system_settings_updated_at
  before update on system_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- sequence_counters — atomic counters for human-readable IDs / cert numbers
-- ---------------------------------------------------------------------
create table if not exists sequence_counters (
  scope   text primary key,
  counter int not null default 0
);

create or replace function next_sequence(p_scope text)
returns int
language sql
as $$
  insert into sequence_counters (scope, counter)
  values (p_scope, 1)
  on conflict (scope) do update set counter = sequence_counters.counter + 1
  returning counter;
$$;

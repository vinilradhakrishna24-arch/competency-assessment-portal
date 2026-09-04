-- =====================================================================
-- 0003_assessment_tables.sql
-- Assessments, frozen assessment_questions, answers, results, certificates,
-- audit logs, verification attempts (rate limiting)
-- =====================================================================

-- ---------------------------------------------------------------------
-- assessments  (an "assessment" row == one attempt)
-- ---------------------------------------------------------------------
create table if not exists assessments (
  id                  uuid primary key default gen_random_uuid(),
  assessment_code     text not null unique,             -- e.g. PTW-2026-00128
  candidate_id        uuid not null references candidates(id),
  competency_id       uuid not null references competencies(id),
  question_set_id     uuid references question_sets(id),
  question_source     text not null check (question_source in ('specific_set', 'random')),
  num_questions       int not null check (num_questions > 0),
  pass_mark           numeric(5,2) not null check (pass_mark > 0 and pass_mark <= 100), -- snapshot from competency at creation time
  duration_minutes    int not null check (duration_minutes > 0),
  link_expires_at     timestamptz not null,
  token_hash          text not null unique,              -- sha256(token), raw token never stored
  randomize_options   boolean not null default false,

  status              text not null default 'DRAFT' check (status in (
                        'DRAFT', 'PENDING', 'STARTED', 'SUBMITTED',
                        'PASSED', 'FAILED', 'EXPIRED', 'CANCELLED'
                      )),

  started_at          timestamptz,
  ends_at             timestamptz,
  submitted_at        timestamptz,

  score_percentage    numeric(8,4),
  earned_marks        numeric(10,2),
  available_marks     numeric(10,2),

  attempt_number      int not null default 1,
  parent_assessment_id uuid references assessments(id),

  verification_locked_until timestamptz,                 -- rate-limit lock for employee-id verification
  verification_fail_count   int not null default 0,

  cancelled_at        timestamptz,
  cancelled_reason     text,

  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_assessments_candidate on assessments(candidate_id);
create index if not exists idx_assessments_competency on assessments(competency_id);
create index if not exists idx_assessments_status on assessments(status);
create index if not exists idx_assessments_token_hash on assessments(token_hash);
create index if not exists idx_assessments_created_at on assessments(created_at);
create index if not exists idx_assessments_parent on assessments(parent_assessment_id);

drop trigger if exists trg_assessments_updated_at on assessments;
create trigger trg_assessments_updated_at
  before update on assessments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- assessment_questions (FROZEN at generation time — never regenerated)
-- ---------------------------------------------------------------------
create table if not exists assessment_questions (
  id                      uuid primary key default gen_random_uuid(),
  assessment_id           uuid not null references assessments(id) on delete cascade,
  question_id             uuid references questions(id) on delete set null,
  display_order           int not null,

  -- immutable snapshot of the question as it appeared to the candidate
  question_text_snapshot  text not null,
  scenario_text_snapshot  text,
  question_type_snapshot  text not null check (question_type_snapshot in ('single', 'multiple', 'true_false')),
  marks_snapshot          numeric(6,2) not null,

  -- ordered options as shown to the candidate: [{option_id, option_key, option_text}]
  -- deliberately excludes is_correct
  option_order_snapshot   jsonb not null,

  -- correct option ids for this attempt — server-only, RLS blocks all client access
  correct_option_ids      jsonb not null,

  unique (assessment_id, question_id),
  unique (assessment_id, display_order)
);

create index if not exists idx_assessment_questions_assessment on assessment_questions(assessment_id);

-- ---------------------------------------------------------------------
-- answers (autosaved candidate responses)
-- ---------------------------------------------------------------------
create table if not exists answers (
  id                      uuid primary key default gen_random_uuid(),
  assessment_id           uuid not null references assessments(id) on delete cascade,
  assessment_question_id  uuid not null references assessment_questions(id) on delete cascade,
  selected_option_ids     jsonb not null default '[]'::jsonb,
  saved_at                timestamptz not null default now(),
  unique (assessment_question_id)
);

create index if not exists idx_answers_assessment on answers(assessment_id);

-- ---------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------
create table if not exists results (
  id                uuid primary key default gen_random_uuid(),
  assessment_id     uuid not null unique references assessments(id) on delete cascade,
  score_percentage  numeric(8,4) not null,
  earned_marks      numeric(10,2) not null,
  available_marks   numeric(10,2) not null,
  pass_mark_used    numeric(5,2) not null,
  passed            boolean not null,
  computed_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------
create table if not exists certificates (
  id                  uuid primary key default gen_random_uuid(),
  assessment_id       uuid not null unique references assessments(id),
  candidate_id        uuid not null references candidates(id),
  competency_id       uuid not null references competencies(id),
  certificate_number  text not null unique,          -- e.g. SUTC/PTW/2026/00128
  verification_code   text not null unique,          -- opaque, used in /verify/{code}
  storage_path        text,                           -- private bucket path (set once PDF generated)
  score_percentage    numeric(8,4) not null,
  issued_at           timestamptz not null default now(),
  revoked             boolean not null default false,
  revoked_at          timestamptz,
  revoked_reason      text
);

create index if not exists idx_certificates_candidate on certificates(candidate_id);
create index if not exists idx_certificates_verification_code on certificates(verification_code);

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------
create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  actor_user_id   uuid references profiles(id),
  actor_type      text not null check (actor_type in ('admin', 'viewer', 'candidate', 'system')),
  action          text not null,
  entity_type     text,
  entity_id       text,
  old_value_json  jsonb,
  new_value_json  jsonb,
  ip_address      text,
  user_agent      text
);

create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_action on audit_logs(action);

-- ---------------------------------------------------------------------
-- verification_attempts — candidate employee-id verification, for rate limiting
-- ---------------------------------------------------------------------
create table if not exists verification_attempts (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid references assessments(id) on delete cascade,
  success         boolean not null,
  ip_address      text,
  user_agent      text,
  attempted_at    timestamptz not null default now()
);

create index if not exists idx_verification_attempts_assessment on verification_attempts(assessment_id, attempted_at desc);
create index if not exists idx_verification_attempts_ip on verification_attempts(ip_address, attempted_at desc);

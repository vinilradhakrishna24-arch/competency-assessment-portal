// Hand-maintained types mirroring the Postgres schema in supabase/migrations.
// Keep this in sync whenever a migration changes table shape.

// RoleName stays 'admin' | 'viewer' for now -- that is still what
// authorization actually keys off (roles.permission_level, see migration
// 0012). A role's *display name* (roles.name) can now be any unique
// string (e.g. "HSE Manager") without widening this union; role-specific
// UI (nav sections, stream-scoped gating) is added in a later phase.
export type RoleName = 'admin' | 'viewer';

export type CompetencyStream = 'technical' | 'hse';

export type AssessmentStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'STARTED'
  | 'SUBMITTED'
  | 'PASSED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'AWAITING_APPROVAL'
  | 'CERTIFIED';

export type QuestionType = 'single' | 'multiple' | 'true_false';
export type QuestionSource = 'specific_set' | 'random';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ActorType = 'admin' | 'viewer' | 'candidate' | 'system';
export type ScoreBand = 'green' | 'amber' | 'red';

export interface Role {
  id: string;
  name: string;
  /** The actual authorization key -- see migration 0012. */
  permission_level: RoleName;
  /** NULL = unrestricted (every competency stream). A non-null array
   * restricts a viewer-level role to only those streams (e.g. HSE
   * Manager -> ['hse']). */
  stream_scope: CompetencyStream[] | null;
  /** Only meaningful for a viewer-tier role. When true, grants create/edit
   * rights on questions and candidates (stream-scoped) without promoting to
   * full Admin -- see is_manager() / migration 0017. */
  can_manage: boolean;
  description: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role_id: string;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  employee_id: string;
  full_name: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  project_contract: string | null;
  department: string | null;
  /** Requested field, applies to both streams. Migration 0011. */
  location: string | null;
  active_status: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Competency {
  id: string;
  code: string;
  competency_name: string;
  description: string | null;
  pass_mark: number;
  active: boolean;
  /** 'technical' (LOA/SFT/PTW, existing) or 'hse' (new) -- migration 0011. */
  stream: CompetencyStream;
  /** HSE only. score >= pass_mark => green, amber_threshold <= score < pass_mark
   * => amber, score < amber_threshold => red. Null disables RAG banding. */
  amber_threshold: number | null;
  /** HSE only. certificates.valid_until = issued_at + validity_months.
   * Null means certificates never expire (current technical behavior). */
  validity_months: number | null;
  /** Minimum days after a FAILED attempt before reassessment. 0 = no wait
   * (current technical behavior). */
  reassessment_wait_days: number;
  /** When true, a passing score routes to AWAITING_APPROVAL instead of
   * auto-issuing a certificate. False = current technical behavior. */
  requires_result_approval: boolean;
  created_at: string;
  updated_at: string;
}

/** A sub-topic within a competency (e.g. one of HSE Advisor's ~34 areas),
 * used to tag questions and break assessment scores down. Migration 0011. */
export interface CompetencyArea {
  id: string;
  competency_id: string;
  code: string;
  area_name: string;
  /** Knowledge or Skill -- always specific to THIS (competency, element)
   * pair, never a global per-element mapping. This is the single source of
   * truth for Competency Type everywhere in the app. Migration 0018. */
  competency_type: 'knowledge' | 'skill';
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuestionSet {
  id: string;
  competency_id: string;
  set_name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface Question {
  id: string;
  competency_id: string;
  /** HSE only -- tags this question to one competency_areas row. Null for
   * every technical question. */
  competency_area_id: string | null;
  question_set_id: string | null;
  question_type: QuestionType;
  question_text: string;
  scenario_text: string | null;
  marks: number;
  difficulty: Difficulty | null;
  explanation_admin_only: string | null;
  active: boolean;
  /** Optional image (e.g. a safety diagram) shown above the question text
   * during the exam. Public Storage URL, or null for text-only questions. */
  image_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  option_key: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

/** Option shape shown to the candidate — is_correct is never present. */
export interface CandidateOption {
  option_id: string;
  option_key: string;
  option_text: string;
}

export interface SystemSettingBranding {
  company_name: string;
  company_name_ar: string;
  portal_name: string;
  company_prefix: string;
  logo_url: string | null;
  certificate_footer: string;
  primary_accent: string;
  secondary_accent: string;
}

export interface Assessment {
  id: string;
  assessment_code: string;
  candidate_id: string;
  competency_id: string;
  question_set_id: string | null;
  question_source: QuestionSource;
  num_questions: number;
  pass_mark: number;
  duration_minutes: number;
  link_expires_at: string;
  token_hash: string;
  randomize_options: boolean;
  status: AssessmentStatus;
  started_at: string | null;
  ends_at: string | null;
  submitted_at: string | null;
  score_percentage: number | null;
  earned_marks: number | null;
  available_marks: number | null;
  attempt_number: number;
  parent_assessment_id: string | null;
  verification_locked_until: string | null;
  verification_fail_count: number;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  question_id: string | null;
  display_order: number;
  question_text_snapshot: string;
  scenario_text_snapshot: string | null;
  question_type_snapshot: QuestionType;
  marks_snapshot: number;
  option_order_snapshot: CandidateOption[];
  correct_option_ids: string[]; // server-only — never sent to the candidate browser
  image_url_snapshot: string | null;
  /** Frozen copy of the question's competency_area_id at exam-generation
   * time. Null for every technical question. */
  competency_area_id_snapshot: string | null;
}

/** Per-competency-area RAG score breakdown for one assessment attempt.
 * Only written when the competency has amber_threshold set (HSE).
 * Migration 0011/0013. */
export interface AssessmentAreaScore {
  id: string;
  assessment_id: string;
  competency_area_id: string;
  earned_marks: number;
  available_marks: number;
  score_percentage: number;
  band: ScoreBand;
}

export interface Answer {
  id: string;
  assessment_id: string;
  assessment_question_id: string;
  selected_option_ids: string[];
  saved_at: string;
}

export interface Result {
  id: string;
  assessment_id: string;
  score_percentage: number;
  earned_marks: number;
  available_marks: number;
  pass_mark_used: number;
  passed: boolean;
  computed_at: string;
}

export interface Certificate {
  id: string;
  assessment_id: string;
  candidate_id: string;
  competency_id: string;
  certificate_number: string;
  verification_code: string;
  storage_path: string | null;
  score_percentage: number;
  issued_at: string;
  /** HSE only -- issued_at + competencies.validity_months. Null means this
   * certificate never expires (current technical behavior). */
  valid_until: string | null;
  revoked: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
}

/** Audit trail for the manual approve/reject decision on an
 * AWAITING_APPROVAL assessment. Migration 0011/0013. */
export interface ResultApproval {
  id: string;
  assessment_id: string;
  decision: 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string;
  comment: string | null;
}

export interface AuditLog {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_type: ActorType;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value_json: unknown;
  new_value_json: unknown;
  ip_address: string | null;
  user_agent: string | null;
}

/** Payload shape for the candidate-facing exam question (no correct answers). */
export interface CandidateQuestionView {
  assessment_question_id: string;
  display_order: number;
  question_text: string;
  scenario_text: string | null;
  question_type: QuestionType;
  marks: number;
  options: CandidateOption[];
  selected_option_ids: string[];
  image_url: string | null;
}

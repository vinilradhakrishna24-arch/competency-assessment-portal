// Hand-maintained types mirroring the Postgres schema in supabase/migrations.
// Keep this in sync whenever a migration changes table shape.

export type RoleName = 'admin' | 'viewer';

export type AssessmentStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'STARTED'
  | 'SUBMITTED'
  | 'PASSED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export type QuestionType = 'single' | 'multiple' | 'true_false';
export type QuestionSource = 'specific_set' | 'random';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ActorType = 'admin' | 'viewer' | 'candidate' | 'system';

export interface Role {
  id: string;
  name: RoleName;
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
  question_set_id: string | null;
  question_type: QuestionType;
  question_text: string;
  scenario_text: string | null;
  marks: number;
  difficulty: Difficulty | null;
  explanation_admin_only: string | null;
  active: boolean;
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
  revoked: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
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
}

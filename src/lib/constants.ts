import type { AssessmentStatus, QuestionType, Difficulty } from '@/types/database';

/** Fallback pass mark used only if system_settings.default_pass_mark is
 * somehow missing. The real, editable value always lives in the database
 * (competencies.pass_mark / system_settings) — never hard-code 85 in
 * business logic, only here as a last-resort default.
 */
export const FALLBACK_PASS_MARK = 85.0;

export const ASSESSMENT_STATUSES: AssessmentStatus[] = [
  'DRAFT',
  'PENDING',
  'STARTED',
  'SUBMITTED',
  'PASSED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
];

export const STATUS_LABELS: Record<AssessmentStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  STARTED: 'In Progress',
  SUBMITTED: 'Submitted',
  PASSED: 'Passed',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export const STATUS_BADGE_CLASSES: Record<AssessmentStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  STARTED: 'bg-blue-50 text-blue-700 border-blue-200',
  SUBMITTED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PASSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  EXPIRED: 'bg-orange-50 text-orange-700 border-orange-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Single Answer',
  multiple: 'Multiple Answer',
  true_false: 'True / False',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const QUICK_DURATIONS_MINUTES = [15, 20, 30, 45];

/** Competency visual identity — distinct but coordinated colors/icons. */
export const COMPETENCY_THEME: Record<
  string,
  { color: string; bg: string; border: string; ring: string }
> = {
  LOA: { color: '#0F5C4A', bg: '#ECFAF5', border: '#BFE9DA', ring: '#0F5C4A' },
  SFT: { color: '#8A5A00', bg: '#FFF7E6', border: '#F2DBA3', ring: '#8A5A00' },
  PTW: { color: '#1E3A8A', bg: '#EEF2FF', border: '#C7D2FE', ring: '#1E3A8A' },
};

export const DEFAULT_COMPETENCY_THEME = {
  color: '#334155',
  bg: '#F1F5F9',
  border: '#E2E8F0',
  ring: '#334155',
};

export const CANDIDATE_GENERIC_ERROR =
  'Unable to verify this assessment. Please check your details or contact the examiner.';

export const AUDIT_ACTIONS = {
  USER_LOGIN: 'user.login',
  CANDIDATE_CREATED: 'candidate.created',
  CANDIDATE_UPDATED: 'candidate.updated',
  CANDIDATE_DELETED: 'candidate.deleted',
  QUESTION_CREATED: 'question.created',
  QUESTION_UPDATED: 'question.updated',
  QUESTION_DEACTIVATED: 'question.deactivated',
  QUESTION_DELETED: 'question.deleted',
  QUESTIONS_IMPORTED: 'questions.imported',
  ASSESSMENT_CREATED: 'assessment.created',
  ASSESSMENT_LINK_GENERATED: 'assessment.link_generated',
  ASSESSMENT_LINK_REGENERATED: 'assessment.link_regenerated',
  ASSESSMENT_CANCELLED: 'assessment.cancelled',
  CANDIDATE_VERIFICATION_SUCCESS: 'candidate.verification_success',
  CANDIDATE_VERIFICATION_FAILED: 'candidate.verification_failed',
  EXAM_STARTED: 'exam.started',
  ANSWER_SAVE_ERROR: 'exam.answer_save_error',
  EXAM_SUBMITTED_MANUAL: 'exam.submitted_manual',
  EXAM_SUBMITTED_AUTO: 'exam.submitted_auto',
  EXAM_PASSED: 'exam.passed',
  EXAM_FAILED: 'exam.failed',
  REASSESSMENT_AUTHORIZED: 'reassessment.authorized',
  CERTIFICATE_GENERATED: 'certificate.generated',
  CERTIFICATE_DOWNLOADED: 'certificate.downloaded',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DELETED: 'user.deleted',
  SETTINGS_CHANGED: 'settings.changed',
} as const;

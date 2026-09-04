import { z } from 'zod';

export const candidateSchema = z.object({
  employee_id: z.string().trim().min(1, 'Employee ID is required').max(64),
  full_name: z.string().trim().min(1, 'Full name is required').max(200),
  designation: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
  mobile: z.string().trim().max(40).optional().or(z.literal('')),
  project_contract: z.string().trim().max(200).optional().or(z.literal('')),
  department: z.string().trim().max(200).optional().or(z.literal('')),
  active_status: z.boolean().default(true),
});
export type CandidateInput = z.infer<typeof candidateSchema>;

export const questionOptionSchema = z.object({
  option_key: z.string().trim().min(1).max(4),
  option_text: z.string().trim().min(1, 'Option text is required').max(1000),
  is_correct: z.boolean().default(false),
});

export const questionSchema = z
  .object({
    competency_id: z.string().uuid('Select a competency'),
    question_set_id: z.string().uuid().optional().nullable(),
    question_type: z.enum(['single', 'multiple', 'true_false']),
    question_text: z.string().trim().min(1, 'Question text is required').max(4000),
    scenario_text: z.string().trim().max(4000).optional().or(z.literal('')),
    marks: z.coerce.number().positive('Marks must be greater than 0').max(1000),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().nullable(),
    explanation_admin_only: z.string().trim().max(4000).optional().or(z.literal('')),
    active: z.boolean().default(true),
    options: z.array(questionOptionSchema).min(2, 'At least two options are required'),
  })
  .superRefine((data, ctx) => {
    const correctCount = data.options.filter((o) => o.is_correct).length;

    if (correctCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'At least one option must be marked correct',
      });
    }

    if (data.question_type === 'single' && correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Single-answer questions must have exactly one correct option',
      });
    }

    if (data.question_type === 'true_false' && data.options.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'True/False questions must have exactly two options',
      });
    }

    if (data.question_type === 'multiple' && correctCount < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Multiple-answer questions must have at least two correct options',
      });
    }
  });
export type QuestionInput = z.infer<typeof questionSchema>;

export const createAssessmentSchema = z
  .object({
    candidate_id: z.string().uuid().optional(),
    new_candidate: candidateSchema.partial({ active_status: true }).optional(),
    competency_id: z.string().uuid('Select a competency'),
    question_source: z.enum(['specific_set', 'random']),
    question_set_id: z.string().uuid().optional().nullable(),
    num_questions: z.coerce.number().int().positive('Enter the number of questions'),
    pass_mark: z.coerce.number().min(1).max(100),
    duration_minutes: z.coerce.number().int().positive('Enter a duration'),
    link_expires_at: z.string().min(1, 'Set a link expiry date/time'),
    randomize_options: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.candidate_id && !data.new_candidate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidate_id'],
        message: 'Select an existing candidate or provide new candidate details',
      });
    }
    if (data.question_source === 'specific_set' && !data.question_set_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['question_set_id'],
        message: 'Select a question set',
      });
    }
  });
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const verifyEmployeeIdSchema = z.object({
  employee_id: z.string().trim().min(1, 'Employee ID is required').max(64),
});

export const saveAnswerSchema = z.object({
  assessment_question_id: z.string().uuid(),
  selected_option_ids: z.array(z.string().uuid()).max(20),
});

export const questionSetSchema = z.object({
  competency_id: z.string().uuid(),
  set_name: z.string().trim().min(1, 'Set name is required').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export const competencySchema = z.object({
  code: z.string().trim().min(1).max(20),
  competency_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  pass_mark: z.coerce.number().min(1).max(100),
  active: z.boolean().default(true),
});

export const brandingSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  company_name_ar: z.string().trim().max(200).optional().or(z.literal('')),
  portal_name: z.string().trim().min(1).max(200),
  company_prefix: z.string().trim().min(1).max(20),
  // Accepts a full URL (e.g. Supabase Storage) or a site-relative path
  // (e.g. "/shaher-logo.png" served from public/).
  logo_url: z
    .string()
    .trim()
    .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'Must be a URL or a path starting with /')
    .optional()
    .or(z.literal(''))
    .nullable(),
  certificate_footer: z.string().trim().max(500),
  primary_accent: z.string().trim().max(20),
  secondary_accent: z.string().trim().max(20),
});

export const inviteUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required').max(200),
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(['admin', 'viewer']),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

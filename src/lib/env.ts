// Centralized, validated environment access. Fail fast and loud if a
// required variable is missing rather than surfacing a cryptic error deep
// inside a request handler.

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example for the full list.`
    );
  }
  return value;
}

export const env = {
  // Browser-safe
  NEXT_PUBLIC_SUPABASE_URL: () =>
    required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: () =>
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  NEXT_PUBLIC_APP_URL: () =>
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  // Server-only — accessing these from a file bundled into the client is a bug.
  SUPABASE_SERVICE_ROLE_KEY: () => {
    if (typeof window !== 'undefined') {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY was accessed from the browser. This key must never reach the client bundle.'
      );
    }
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
  },

  // Server-only — used to HMAC-sign the candidate "employee ID verified"
  // cookie (see lib/exam/session-cookie.ts). Should be its own long random
  // value in production, independent of the Supabase keys, so rotating one
  // secret never silently rotates the other. Falls back (with a loud
  // console warning) to the service-role key, and finally to an insecure
  // hard-coded string, so local development still works without it set.
  EXAM_SESSION_SECRET: () => {
    if (typeof window !== 'undefined') {
      throw new Error('EXAM_SESSION_SECRET was accessed from the browser.');
    }
    if (process.env.EXAM_SESSION_SECRET) return process.env.EXAM_SESSION_SECRET;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn(
        '[env] EXAM_SESSION_SECRET is not set — falling back to SUPABASE_SERVICE_ROLE_KEY. ' +
          'Set a dedicated EXAM_SESSION_SECRET before deploying to production.'
      );
      return process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
    console.warn(
      '[env] Neither EXAM_SESSION_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set — using an insecure ' +
        'development-only fallback secret. This must never happen in production.'
    );
    return 'insecure-dev-fallback-secret-change-me';
  },
};

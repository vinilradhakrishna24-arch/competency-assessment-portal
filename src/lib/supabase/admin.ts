import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * This must only ever be imported from:
 *   - Route Handlers under src/app/api/**
 *   - Server-only lib modules called exclusively from those routes
 *
 * The `server-only` import above makes any accidental import from a Client
 * Component fail the build. Never pass this client, or data fetched with
 * elevated privilege via it, directly back to the browser without explicit
 * field-level filtering (e.g. stripping is_correct/correct_option_ids).
 *
 * This is the ONLY client used for candidate-facing exam operations, since
 * candidates never authenticate with Supabase Auth and therefore have no
 * RLS-visible session at all. Every route that uses this client MUST do its
 * own authorization checks (token hash lookup, employee ID match, status,
 * expiry) before touching data — see src/lib/exam/*.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL(), env.SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

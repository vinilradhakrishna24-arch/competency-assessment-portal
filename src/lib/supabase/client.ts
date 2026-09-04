'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/** Browser-side Supabase client. Uses only the publishable anon key —
 * every table it can reach is governed by RLS. Used for admin/viewer
 * authenticated screens (login, session refresh, realtime if ever added).
 * Candidates never use this client directly for exam data — that all goes
 * through server API routes. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL(), env.NEXT_PUBLIC_SUPABASE_ANON_KEY());
}

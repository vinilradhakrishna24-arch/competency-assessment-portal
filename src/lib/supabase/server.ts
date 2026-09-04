import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/** Server Component / Route Handler Supabase client, bound to the current
 * request's auth cookies. RLS applies exactly as it would for the signed-in
 * user in the browser — this is how admin/viewer pages and APIs read and
 * write data safely without ever touching the service-role key. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL(), env.NEXT_PUBLIC_SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component with no response to write to —
          // safe to ignore as long as middleware also refreshes the session.
        }
      },
    },
  });
}

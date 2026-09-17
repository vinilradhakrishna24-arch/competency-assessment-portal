import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Called by the login form immediately after a successful
 * signInWithPassword, to confirm the authenticated user actually has a
 * usable internal profile before routing them into the app. This is the
 * one place that distinguishes, server-side, between the auth-layer
 * succeeding but the *authorization* layer failing for a different reason
 * each time -- profile row missing entirely, profile inactive, or profile
 * present but its role row missing/broken -- while the client only ever
 * sees a short reason code (never raw DB detail) since the caller has
 * already proven they hold valid credentials for this account. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('[profile-check] no authenticated user', userError?.message);
    return NextResponse.json({ ok: false, reason: 'unauthenticated' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active, role_id, roles(permission_level)')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[profile-check] failed to load profile', { userId: user.id, error: profileError.message });
    return NextResponse.json({ ok: false, reason: 'db_error' }, { status: 500 });
  }

  if (!profile) {
    console.error('[profile-check] auth user has no profile row', { userId: user.id, email: user.email });
    return NextResponse.json({ ok: false, reason: 'profile_missing' }, { status: 403 });
  }

  if (!profile.active) {
    console.error('[profile-check] profile is inactive', { userId: user.id, email: user.email });
    return NextResponse.json({ ok: false, reason: 'inactive' }, { status: 403 });
  }

  const roleRow = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  if (!profile.role_id || !roleRow) {
    console.error('[profile-check] profile has no valid role assigned', { userId: user.id, email: user.email });
    return NextResponse.json({ ok: false, reason: 'no_role' }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}

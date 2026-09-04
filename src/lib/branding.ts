import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { SystemSettingBranding } from '@/types/database';

const FALLBACK: SystemSettingBranding = {
  company_name: 'Shaher United Trading & Cont. Co.',
  company_name_ar: 'شركة شاهر المتحدة للتجارة والمقاولات',
  portal_name: 'Competency Assessment Portal',
  company_prefix: 'SUTC',
  logo_url: '/shaher-logo.png',
  certificate_footer: 'This certificate is issued electronically and is valid without a signature.',
  primary_accent: '#0B1F3A',
  secondary_accent: '#C8102E',
};

/** Branding is non-sensitive (company name, logo, colors) but lives in a
 * table that's RLS-locked to Admins, since it also holds operational
 * defaults. Public/candidate-facing pages and the Viewer role both need the
 * display fields, so we read it with the service-role client and only ever
 * return this narrow, safe shape — never the raw table. */
export async function getBranding(): Promise<SystemSettingBranding> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'branding')
    .maybeSingle();

  if (!data?.value) return FALLBACK;
  return { ...FALLBACK, ...(data.value as Partial<SystemSettingBranding>) };
}

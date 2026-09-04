import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getBranding } from '@/lib/branding';

/** Human-readable assessment ID, e.g. "PTW-2026-00128". Uses an atomic
 * Postgres counter (next_sequence) scoped per competency+year, so
 * concurrent assessment creation can never collide. This ID is a display
 * label only — it is never used as a security mechanism (see token.ts). */
export async function generateAssessmentCode(competencyCode: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const scope = `assessment:${competencyCode}:${year}`;

  const { data, error } = await supabase.rpc('next_sequence', { p_scope: scope });
  if (error) throw new Error(`Failed to generate assessment code: ${error.message}`);

  const seq = String(data).padStart(5, '0');
  return `${competencyCode}-${year}-${seq}`;
}

/** Certificate number, e.g. "SUTC/PTW/2026/00128", using the configurable
 * company prefix from branding settings rather than a hard-coded value. */
export async function generateCertificateNumber(competencyCode: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const branding = await getBranding();
  const year = new Date().getFullYear();
  const scope = `certificate:${competencyCode}:${year}`;

  const { data, error } = await supabase.rpc('next_sequence', { p_scope: scope });
  if (error) throw new Error(`Failed to generate certificate number: ${error.message}`);

  const seq = String(data).padStart(5, '0');
  return `${branding.company_prefix}/${competencyCode}/${year}/${seq}`;
}

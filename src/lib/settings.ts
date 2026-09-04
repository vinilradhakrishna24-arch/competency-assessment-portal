import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface VerificationRetrySettings {
  max_attempts: number;
  window_minutes: number;
  lock_minutes: number;
}

export interface RandomizationDefaults {
  randomize_questions: boolean;
  randomize_options: boolean;
}

const DEFAULT_VERIFICATION_RETRY: VerificationRetrySettings = {
  max_attempts: 5,
  window_minutes: 15,
  lock_minutes: 15,
};

export async function getSystemSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle();
  if (!data?.value) return fallback;
  return { ...fallback, ...(data.value as Partial<T>) };
}

export async function getVerificationRetrySettings(): Promise<VerificationRetrySettings> {
  return getSystemSetting('verification_retry_settings', DEFAULT_VERIFICATION_RETRY);
}

export async function getDefaultPassMark(): Promise<number> {
  const setting = await getSystemSetting('default_pass_mark', { value: 85.0 });
  return setting.value;
}

export async function getRandomizationDefaults(): Promise<RandomizationDefaults> {
  return getSystemSetting('randomization_defaults', {
    randomize_questions: true,
    randomize_options: true,
  });
}

export async function getTokenExpiryDefaultHours(): Promise<number> {
  const setting = await getSystemSetting('token_expiry_defaults', { default_hours: 72 });
  return setting.default_hours;
}

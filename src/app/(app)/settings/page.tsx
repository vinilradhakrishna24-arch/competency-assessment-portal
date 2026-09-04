import { PageHeader } from '@/components/ui/page-header';
import { SettingsForm } from '@/components/settings/settings-form';
import { getAllSettings } from '@/lib/actions/settings';
import { getCompetencies } from '@/lib/actions/taxonomy';
import { requireAdmin } from '@/lib/auth/session';
import type { SystemSettingBranding } from '@/types/database';

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, competencies] = await Promise.all([getAllSettings(), getCompetencies()]);

  return (
    <div>
      <PageHeader title="Settings" description="Central configuration for pass marks, durations, branding, and security defaults." />
      <SettingsForm
        branding={settings.branding as SystemSettingBranding}
        defaultPassMark={(settings.default_pass_mark as { value: number })?.value ?? 85}
        defaultDurations={(settings.default_durations_minutes as { options: number[] })?.options ?? [15, 20, 30, 45]}
        tokenExpiryHours={(settings.token_expiry_defaults as { default_hours: number })?.default_hours ?? 72}
        randomization={
          (settings.randomization_defaults as { randomize_questions: boolean; randomize_options: boolean }) ?? {
            randomize_questions: true,
            randomize_options: true,
          }
        }
        verificationRetry={
          (settings.verification_retry_settings as { max_attempts: number; window_minutes: number; lock_minutes: number }) ?? {
            max_attempts: 5,
            window_minutes: 15,
            lock_minutes: 15,
          }
        }
        competencies={competencies}
      />
    </div>
  );
}

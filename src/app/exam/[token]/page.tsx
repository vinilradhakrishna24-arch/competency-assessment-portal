import { getBranding } from '@/lib/branding';
import { ExamApp } from '@/components/exam/exam-app';

export default async function ExamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = await getBranding();

  return <ExamApp token={token} portalName={branding.portal_name} logoUrl={branding.logo_url} />;
}

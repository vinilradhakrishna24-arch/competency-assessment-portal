import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import './globals.css';
import { getBranding } from '@/lib/branding';

// Body/UI font is Trebuchet MS (a system font — see globals.css), so only
// the monospace face still loads from next/font. It's kept narrowly for
// alphanumeric codes and countdown timers (assessment/certificate codes,
// exam timer) where fixed-width digits aid readability; Trebuchet MS has
// no true monospace variant.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding.portal_name,
    description: `${branding.portal_name} — engineer competency assessment for LOA, SFT and PTW.`,
  };
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}

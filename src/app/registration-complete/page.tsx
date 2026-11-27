import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegistrationComplete } from '@/components/auth/registration-complete';
import { getRequestLocale } from '@/server/locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const french = (await getRequestLocale()) === 'fr';
  return {
    title: french ? 'Votre espace · Écartéo' : 'Your workspace · Écartéo',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default function Page() {
  return (
    <AuthShell>
      <RegistrationComplete />
    </AuthShell>
  );
}

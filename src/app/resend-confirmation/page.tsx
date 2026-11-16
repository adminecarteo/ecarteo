import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { AuthShell } from '@/components/auth/auth-shell';
import { authConfigured } from '@/server/config';
import { getRequestLocale } from '@/server/locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      (await getRequestLocale()) === 'fr'
        ? 'Confirmer mon email · Écartéo'
        : 'Confirm your email · Écartéo',
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return (
    <AuthShell>
      <AuthForm mode="resend" configured={authConfigured()} />
    </AuthShell>
  );
}

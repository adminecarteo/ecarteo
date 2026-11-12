import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthForm } from '@/components/auth/auth-form';
import { authConfigured } from '@/server/config';
import { safeNext } from '@/lib/auth-schema';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const french = (await getRequestLocale()) === 'fr';
  return {
    title: french ? 'Mot de passe oublié · Écartéo' : 'Forgot password · Écartéo',
    description: french
      ? 'Retrouvez l’accès à votre espace Écartéo.'
      : 'Regain access to your Écartéo workspace.',
    robots: { index: false, follow: false },
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AuthShell>
      <AuthForm
        mode="forgot"
        configured={authConfigured()}
        next={safeNext(typeof params.next === 'string' ? params.next : undefined)}
        notice={typeof params.notice === 'string' ? params.notice : undefined}
      />
    </AuthShell>
  );
}

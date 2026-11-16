import { PublisherInformation } from '@/components/publisher-information';
import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthForm } from '@/components/auth/auth-form';
import { authConfigured } from '@/server/config';
import { auditOfferId } from '@/lib/audit-offer';
import { safeNext } from '@/lib/auth-schema';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const french = (await getRequestLocale()) === 'fr';
  return {
    title: french ? 'Créer un compte · Écartéo' : 'Create an account · Écartéo',
    description: french
      ? 'Créez votre espace client Écartéo.'
      : 'Create your Écartéo customer workspace.',
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
        mode="signup"
        offer={auditOfferId(params.offer)}
        configured={authConfigured()}
        next={safeNext(typeof params.next === 'string' ? params.next : undefined)}
        notice={typeof params.notice === 'string' ? params.notice : undefined}
      />
      <PublisherInformation />
    </AuthShell>
  );
}

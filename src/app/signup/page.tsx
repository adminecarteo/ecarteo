import { PublisherInformation } from '@/components/publisher-information';
import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthForm } from '@/components/auth/auth-form';
import { authConfigured } from '@/server/config';
import { auditOfferId, offerRequestPath } from '@/lib/audit-offer';
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
  const offer = auditOfferId(params.offer);
  const next = offer
    ? offerRequestPath(offer)
    : safeNext(typeof params.next === 'string' ? params.next : undefined);
  const destination = new URL(next, 'https://ecarteo.invalid');
  return (
    <AuthShell>
      <AuthForm
        mode="signup"
        offer={
          destination.pathname === '/app/requests'
            ? auditOfferId(destination.searchParams.get('offer'))
            : undefined
        }
        configured={authConfigured()}
        next={next}
        notice={typeof params.notice === 'string' ? params.notice : undefined}
      />
      <PublisherInformation />
    </AuthShell>
  );
}

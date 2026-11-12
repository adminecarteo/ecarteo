import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { redirect } from 'next/navigation';
import { requireAccount } from '@/server/auth';
import { listRequests } from '@/server/accounts-requests';
import { AppError } from '@/server/http';
import { PortalFailure } from '@/components/portal/portal-failure';
import { PortalShell } from '@/components/portal/portal-shell';
import { RequestsPanel } from '@/components/portal/requests-panel';
import { isFrontendDeployment } from '@/lib/deployment-target';
import { FrontendRequests } from '@/components/frontend-bootstrap';
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === 'fr' ? 'Demandes d’audit · Écartéo' : 'Audit requests · Écartéo',
    robots: { index: false, follow: false },
  };
}
export default async function RequestsPage() {
  if (isFrontendDeployment()) return <FrontendRequests />;
  const locale = await getRequestLocale();
  const copy = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  let account, data;
  try {
    account = await requireAccount();
    data = await listRequests(account.user.id, {});
  } catch (error) {
    if (error instanceof AppError && error.status === 401)
      redirect('/login?next=%2Fapp%2Frequests');
    return <PortalFailure error={error} />;
  }
  const quality = account.profile.role === 'qualite';
  return (
    <PortalShell
      title={copy('Demandes d’audit', 'Audit requests')}
      description={
        quality
          ? copy(
              'Examinez les besoins clients, confirmez le périmètre et préparez les scénarios d’intervention.',
              'Review client needs, confirm the scope and prepare audit scenarios.',
            )
          : copy(
              'Décrivez votre besoin et suivez la préparation de votre prochain audit.',
              'Describe your needs and track the preparation of your next audit.',
            )
      }
      quality={quality}
    >
      <RequestsPanel initial={data} quality={quality} />
    </PortalShell>
  );
}

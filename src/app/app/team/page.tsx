import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { redirect } from 'next/navigation';
import { requireAccount } from '@/server/auth';
import { listTeam } from '@/server/accounts-requests';
import { AppError } from '@/server/http';
import { PortalFailure } from '@/components/portal/portal-failure';
import { PortalShell } from '@/components/portal/portal-shell';
import { TeamPanel } from '@/components/portal/team-panel';
import { isFrontendDeployment } from '@/lib/deployment-target';
import { FrontendTeam } from '@/components/frontend-bootstrap';
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === 'fr' ? 'Équipe et accès · Écartéo' : 'Team and access · Écartéo',
    robots: { index: false, follow: false },
  };
}
export default async function TeamPage() {
  if (isFrontendDeployment()) return <FrontendTeam />;
  const locale = await getRequestLocale();
  const copy = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  let account, data;
  try {
    account = await requireAccount();
    data = await listTeam(account.user.id, {});
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect('/login?next=%2Fapp%2Fteam');
    return <PortalFailure error={error} />;
  }
  return (
    <PortalShell
      title={copy('Équipe et accès', 'Team and access')}
      description={copy(
        'Invitez vos collaborateurs et les membres de vos organisations clientes. Contrôlez les accès sans modifier l’historique des audits.',
        'Invite colleagues and members of your client organizations. Manage access while preserving the audit history.',
      )}
      quality
    >
      <TeamPanel initial={data} actorId={account.user.id} />
    </PortalShell>
  );
}

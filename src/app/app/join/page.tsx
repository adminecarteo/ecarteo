import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import { requireUser } from '@/server/auth';
import { PortalShell } from '@/components/portal/portal-shell';
import { JoinPanel } from '@/components/portal/join-panel';
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: locale === 'fr' ? 'Accepter une invitation · Écartéo' : 'Accept an invitation · Écartéo',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export default async function JoinPage() {
  const locale = await getRequestLocale();
  const copy = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  let email: string | null = null;
  try {
    email = (await requireUser()).user.email ?? null;
  } catch {
    /* A confirmed Auth identity may not yet have a profile. */
  }
  return (
    <PortalShell
      title={copy('Bienvenue dans votre équipe', 'Welcome to your team')}
      description={copy(
        'Une invitation vous permet de rejoindre l’organisation ou l’équipe qui vous a donné accès.',
        'Use your invitation to join the organization or team that has given you access.',
      )}
    >
      <JoinPanel email={email} />
    </PortalShell>
  );
}

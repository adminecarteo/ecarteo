import type { Metadata } from 'next';
import { OffersPageContent } from '@/components/marketing/pages';
import { getRequestLocale } from '@/server/locale';

export async function generateMetadata(): Promise<Metadata> {
  const fr = (await getRequestLocale()) === 'fr';
  return {
    title: fr ? 'Les offres · Écartéo' : 'Our offers · Écartéo',
    description: fr
      ? 'Audit Flash, suivi continu et missions pour les réseaux et l’international. Explorez les périmètres d’audit et les livrables Écartéo.'
      : 'Flash audits, continuous monitoring and audits for networks and international teams. Explore Écartéo audit scopes and deliverables.',
    robots: { index: true, follow: true },
  };
}
export default function Page() {
  return <OffersPageContent />;
}

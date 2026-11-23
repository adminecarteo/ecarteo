import { PublisherInformation } from '@/components/publisher-information';
import type { Metadata } from 'next';
import { OffersPageContent } from '@/components/marketing/pages';
import { getRequestLocale } from '@/server/locale';
import { publicPageMetadata } from '@/lib/public-site';

export async function generateMetadata(): Promise<Metadata> {
  const fr = (await getRequestLocale()) === 'fr';
  return {
    title: fr ? 'Les offres · Écartéo' : 'Our offers · Écartéo',
    description: fr
      ? 'Audit Flash, suivi continu et missions pour les réseaux et l’international. Explorez les périmètres d’audit et les livrables Écartéo.'
      : 'Flash audits, continuous monitoring and audits for networks and international teams. Explore Écartéo audit scopes and deliverables.',
    ...publicPageMetadata('/offres'),
  };
}
export default function Page() {
  return <OffersPageContent publisher={<PublisherInformation />} />;
}

import { PublisherInformation } from '@/components/publisher-information';
import type { Metadata } from 'next';
import { MethodPageContent } from '@/components/marketing/pages';
import { getRequestLocale } from '@/server/locale';
import { publicPageMetadata } from '@/lib/public-site';

export async function generateMetadata(): Promise<Metadata> {
  const fr = (await getRequestLocale()) === 'fr';
  return {
    title: fr ? 'La méthode · Écartéo' : 'Our method · Écartéo',
    description: fr
      ? 'Découvrez les huit étapes de la méthode Écartéo : cadrer, écrire, exécuter, documenter, noter, analyser, corriger et retester.'
      : 'Explore the eight steps of the Écartéo method: define, write, execute, document, score, analyse, improve and retest.',
    ...publicPageMetadata('/methode'),
  };
}
export default function Page() {
  return <MethodPageContent publisher={<PublisherInformation />} />;
}

import type { Metadata } from 'next';
import { HomePage } from '@/components/marketing/pages';
import { getRequestLocale } from '@/server/locale';

export async function generateMetadata(): Promise<Metadata> {
  const fr = (await getRequestLocale()) === 'fr';
  return {
    title: fr
      ? 'Écartéo · Mesurez l’écart. Corrigez l’expérience.'
      : 'Écartéo · Measure the gap. Improve the experience.',
    description: fr
      ? 'La plateforme d’audit du parcours client pour identifier les écarts, documenter les constats et piloter les actions d’amélioration.'
      : 'The customer journey audit platform for identifying gaps, documenting findings and managing improvements.',
    robots: { index: true, follow: true },
  };
}
export default function Page() {
  return <HomePage />;
}

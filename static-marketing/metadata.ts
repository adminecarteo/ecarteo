import type { Locale } from '@/lib/i18n';
import type { PublicPagePath } from '@/lib/public-site';
import { legalContent, type LegalPageKind } from '@/components/legal/content';

export const legalPages: Partial<Record<PublicPagePath, LegalPageKind>> = {
  '/mentions-legales': 'publisher',
  '/confidentialite': 'privacy',
  '/conditions': 'terms',
};

export function pageMetadata(path: PublicPagePath, locale: Locale) {
  const legal = legalPages[path];
  if (legal) {
    const content = legalContent[locale][legal];
    return { title: `${content.title} · Écartéo`, description: content.description };
  }
  const french = locale === 'fr';
  if (path === '/methode')
    return {
      title: french ? 'La méthode · Écartéo' : 'Our method · Écartéo',
      description: french
        ? 'Découvrez les huit étapes de la méthode Écartéo : cadrer, écrire, exécuter, documenter, noter, analyser, corriger et retester.'
        : 'Explore the eight steps of the Écartéo method: define, write, execute, document, score, analyse, improve and retest.',
    };
  if (path === '/offres')
    return {
      title: french ? 'Les offres · Écartéo' : 'Our offers · Écartéo',
      description: french
        ? 'Audit Flash, suivi continu et missions pour les réseaux et l’international. Explorez les périmètres d’audit et les livrables Écartéo.'
        : 'Flash audits, continuous monitoring and audits for networks and international teams. Explore Écartéo audit scopes and deliverables.',
    };
  return {
    title: french
      ? 'Écartéo · Mesurez l’écart. Corrigez l’expérience.'
      : 'Écartéo · Measure the gap. Improve the experience.',
    description: french
      ? 'La plateforme d’audit du parcours client pour identifier les écarts, documenter les constats et piloter les actions d’amélioration.'
      : 'The customer journey audit platform for identifying gaps, documenting findings and managing improvements.',
  };
}

import { useEffect } from 'react';
import { HomePage, MethodPageContent, OffersPageContent } from '@/components/marketing/pages';
import { LegalPage } from '@/components/legal/legal-page';
import type { PublicPagePath } from '@/lib/public-site';
import { StaticLocaleProvider, useLocale } from './locale-context';
import { StaticPublisher } from './publisher';
import { legalPages, pageMetadata } from './metadata';

function Content({ path }: { path: PublicPagePath }) {
  const { locale } = useLocale();
  useEffect(() => {
    const metadata = pageMetadata(path, locale);
    document.documentElement.lang = locale;
    document.title = metadata.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', metadata.description);
  }, [locale, path]);
  const publisher = <StaticPublisher />;
  const legal = legalPages[path];
  if (legal) return <LegalPage kind={legal} publisher={publisher} />;
  if (path === '/methode') return <MethodPageContent publisher={publisher} />;
  if (path === '/offres') return <OffersPageContent publisher={publisher} />;
  return <HomePage publisher={publisher} />;
}

export function MarketingApp({ path }: { path: PublicPagePath }) {
  return (
    <StaticLocaleProvider>
      <Content path={path} />
    </StaticLocaleProvider>
  );
}

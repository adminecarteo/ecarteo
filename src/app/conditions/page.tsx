import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { legalContent } from '@/components/legal/content';
import { PublisherInformation } from '@/components/publisher-information';
import { getRequestLocale } from '@/server/locale';
import { publicPageMetadata } from '@/lib/public-site';

export async function generateMetadata(): Promise<Metadata> {
  const content = legalContent[await getRequestLocale()].terms;
  return {
    title: `${content.title} · Écartéo`,
    description: content.description,
    ...publicPageMetadata('/conditions'),
  };
}

export default function Page() {
  return <LegalPage kind="terms" publisher={<PublisherInformation />} />;
}

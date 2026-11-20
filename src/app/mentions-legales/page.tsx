import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { legalContent } from '@/components/legal/content';
import { PublisherInformation } from '@/components/publisher-information';
import { getRequestLocale } from '@/server/locale';

export async function generateMetadata(): Promise<Metadata> {
  const content = legalContent[await getRequestLocale()].publisher;
  return { title: `${content.title} · Écartéo`, description: content.description };
}

export default function Page() {
  return <LegalPage kind="publisher" publisher={<PublisherInformation />} />;
}

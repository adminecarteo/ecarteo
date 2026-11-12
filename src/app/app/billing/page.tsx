import type { Metadata } from 'next';
import { getRequestLocale } from '@/server/locale';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Billing from '@/features/billing';
import { requireAccount } from '@/server/auth';
import { loadBilling } from '@/server/billing';
import { AppError } from '@/server/http';
import { WorkspaceError } from '@/server/workspace-errors';
import { localizedErrorMessage } from '@/lib/api-error-messages';
import { AuthShell } from '@/components/auth/auth-shell';
import styles from '@/components/auth/auth.module.css';
import { isFrontendDeployment } from '@/lib/deployment-target';
import { FrontendBilling } from '@/components/frontend-bootstrap';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title:
      locale === 'fr' ? 'Abonnement et factures · Écartéo' : 'Subscription and invoices · Écartéo',
    robots: { index: false, follow: false },
  };
}
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isFrontendDeployment())
    return <FrontendBilling returned={(await searchParams).checkout === 'returned'} />;
  const locale = await getRequestLocale();
  const copy = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  let data: Awaited<ReturnType<typeof loadBilling>>;
  try {
    data = await loadBilling(await requireAccount());
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect('/login?next=%2Fapp%2Fbilling');
    return (
      <AuthShell>
        <div className={styles.formContent}>
          <h1>{copy('Abonnement et factures', 'Subscription and invoices')}</h1>
          <p className={styles.description}>
            {error instanceof AppError || error instanceof WorkspaceError
              ? localizedErrorMessage(error.code, error.message, locale)
              : copy(
                  'La facturation est temporairement indisponible. Réessayez dans quelques instants.',
                  'Billing is temporarily unavailable. Please try again in a moment.',
                )}
          </p>
          <Link href="/app">{copy('Retour à votre espace', 'Back to your workspace')}</Link>
        </div>
      </AuthShell>
    );
  }
  return <Billing initial={data} returned={(await searchParams).checkout === 'returned'} />;
}

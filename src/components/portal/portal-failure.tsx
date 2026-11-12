import Link from 'next/link';
import { PortalShell } from './portal-shell';
import { AppError } from '@/server/http';
import { WorkspaceError } from '@/server/workspace-errors';
import { getRequestLocale } from '@/server/locale';
import { localizedErrorMessage } from '@/lib/api-error-messages';

export async function PortalFailure({ error }: { error: unknown }) {
  const locale = await getRequestLocale();
  const message =
    error instanceof AppError || error instanceof WorkspaceError
      ? localizedErrorMessage(error.code, error.message, locale)
      : locale === 'fr'
        ? 'Cet espace est temporairement indisponible. Réessayez dans quelques instants.'
        : 'This workspace is temporarily unavailable. Please try again in a moment.';
  return (
    <PortalShell
      title={locale === 'fr' ? 'Votre espace sécurisé' : 'Your secure workspace'}
      description={message}
    >
      <Link className="btn primary" href="/login">
        {locale === 'fr' ? 'Aller à la connexion' : 'Go to sign in'}
      </Link>
    </PortalShell>
  );
}

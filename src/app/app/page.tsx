import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ConsoleApp } from '@/components/console-app';
import { AuthShell } from '@/components/auth/auth-shell';
import { requireAccount } from '@/server/auth';
import { loadWorkspace, WorkspaceError } from '@/server/workspace';
import { AppError } from '@/server/http';
import styles from '@/components/auth/auth.module.css';
import { workspaceQueryParams } from '@/lib/workspace-query';
import { getRequestLocale } from '@/server/locale';
import { localizedErrorMessage } from '@/lib/api-error-messages';
import { isFrontendDeployment } from '@/lib/deployment-target';
import { FrontendWorkspace } from '@/components/frontend-bootstrap';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      (await getRequestLocale()) === 'fr' ? 'Votre espace · Écartéo' : 'Your workspace · Écartéo',
    robots: { index: false, follow: false },
  };
}
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let workspace: Awaited<ReturnType<typeof loadWorkspace>>;
  const locale = await getRequestLocale();
  const fr = locale === 'fr';
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === 'string') query.set(key, value);
  if (isFrontendDeployment()) return <FrontendWorkspace query={query.toString()} />;
  try {
    workspace = await loadWorkspace(await requireAccount(), workspaceQueryParams(query));
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      redirect(`/login?next=${encodeURIComponent(`/app${query.size ? `?${query}` : ''}`)}`);
    }
    const message =
      error instanceof AppError || error instanceof WorkspaceError
        ? localizedErrorMessage(error.code, error.message, locale)
        : fr
          ? 'Votre espace est temporairement indisponible. Réessayez dans quelques instants.'
          : 'Your workspace is temporarily unavailable. Please try again in a moment.';
    return (
      <AuthShell>
        <div className={styles.formContent}>
          <h1>{fr ? 'Votre espace sécurisé' : 'Your secure workspace'}</h1>
          <p className={styles.description}>{message}</p>
          <Link href="/login">{fr ? 'Aller à la connexion' : 'Go to sign in'}</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="boot-state" role="status">
          {fr ? 'Chargement de votre espace…' : 'Loading your workspace…'}
        </div>
      }
    >
      <ConsoleApp
        key={query.toString()}
        initialState={workspace.state}
        actor={workspace.actor}
        operators={workspace.operators}
        initialPage={workspace.page}
        initialSummary={workspace.summary}
      />
    </Suspense>
  );
}

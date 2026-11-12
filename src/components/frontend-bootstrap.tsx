'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthForm } from '@/components/auth/auth-form';
import { ConsoleApp } from '@/components/console-app';
import { PortalShell } from '@/components/portal/portal-shell';
import { TeamPanel } from '@/components/portal/team-panel';
import { RequestsPanel } from '@/components/portal/requests-panel';
import { JoinPanel } from '@/components/portal/join-panel';
import Billing from '@/features/billing';
import { useLocale } from '@/lib/locale-context';
import { localizedErrorMessage } from '@/lib/api-error-messages';
import { workspaceSchema } from '@/lib/state-schema';
import type { Locale } from '@/lib/i18n';
import type { RequestPage, TeamPage } from '@/lib/accounts-requests-schema';
import type { BillingOverview } from '@/lib/billing-types';
import type { WorkspaceResponse } from '@/lib/workspace-client';
import styles from '@/components/auth/auth.module.css';

const userSchema = z.object({ user: z.object({ id: z.uuid(), email: z.email().nullable() }) });
const accountSchema = userSchema.extend({
  profile: z.object({
    id: z.uuid(),
    display_name: z.string(),
    role: z.enum(['qualite', 'operateur', 'client']),
    client_id: z.uuid().nullable(),
    active: z.literal(true),
  }),
});
type Identity = z.infer<typeof userSchema>;
type AccountIdentity = z.infer<typeof accountSchema>;
type LoadContext = { signal: AbortSignal; locale: Locale; resource: string };
type Loader<T> = (context: LoadContext) => Promise<T>;
class BootstrapError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const invalidResponse = () => new BootstrapError(502, 'BOOTSTRAP_RESPONSE', '');

async function readRemote<T>(path: string, { signal, locale }: LoadContext): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept-Language': locale },
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // Preserve an authentication status even if a proxy returned a non-JSON error.
    throw new BootstrapError(response.ok ? 502 : response.status, 'BOOTSTRAP_RESPONSE', '');
  }
  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    throw new BootstrapError(
      response.status,
      typeof error.code === 'string' ? error.code : 'BOOTSTRAP_RESPONSE',
      typeof error.error === 'string' ? error.error : '',
    );
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidResponse();
  return payload as T;
}
async function readIdentity(context: LoadContext): Promise<Identity> {
  const result = userSchema.safeParse(await readRemote('/api/session?mode=user', context));
  if (!result.success) throw invalidResponse();
  return result.data;
}
async function readAccount(context: LoadContext): Promise<AccountIdentity> {
  const result = accountSchema.safeParse(await readRemote('/api/session', context));
  if (!result.success) throw invalidResponse();
  return result.data;
}

/** Data is fetched in the browser so Render's refresh cookies reach the browser response. */
function RemoteLoader<T>({
  resource,
  load,
  loginPath,
  children,
  retry,
}: {
  resource: string;
  load: Loader<T>;
  loginPath?: string;
  children: (data: T) => ReactNode;
  retry: () => void;
}) {
  const { locale, copy } = useLocale();
  const router = useRouter();
  const [state, setState] = useState<
    { kind: 'pending' } | { kind: 'ready'; data: T } | { kind: 'failed'; error: unknown }
  >({ kind: 'pending' });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    void load({ signal, locale, resource }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'failed', error });
        if (error instanceof BootstrapError && error.status === 401 && loginPath)
          router.replace(loginPath);
      },
    );
    return () => controller.abort();
  }, [load, locale, resource, loginPath, router]);

  if (state.kind === 'ready') return children(state.data);
  if (
    state.kind === 'pending' ||
    (state.kind === 'failed' &&
      state.error instanceof BootstrapError &&
      state.error.status === 401 &&
      loginPath)
  )
    return (
      <div className="boot-state" role="status">
        {copy('Chargement de votre espace…', 'Loading your workspace…')}
      </div>
    );
  const fallback = copy(
    'Votre espace est temporairement indisponible. Réessayez dans quelques instants.',
    'Your workspace is temporarily unavailable. Please try again in a moment.',
  );
  const error = state.error;
  const message =
    error instanceof BootstrapError
      ? localizedErrorMessage(error.code, error.message || fallback, locale)
      : fallback;
  return (
    <AuthShell>
      <div className={styles.formContent} role="alert">
        <h1>{copy('Votre espace sécurisé', 'Your secure workspace')}</h1>
        <p className={styles.description}>{message}</p>
        <button className="btn" onClick={retry}>
          {copy('Réessayer', 'Try again')}
        </button>{' '}
        <Link href="/login">{copy('Aller à la connexion', 'Go to sign in')}</Link>
      </div>
    </AuthShell>
  );
}
function RemoteBootstrap<T>(props: Omit<Parameters<typeof RemoteLoader<T>>[0], 'retry'>) {
  const { locale } = useLocale();
  const [attempt, setAttempt] = useState(0);
  return (
    <RemoteLoader
      key={`${locale}:${props.resource}:${attempt}`}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
    />
  );
}

const loadWorkspace: Loader<WorkspaceResponse> = async (context) => {
  const result = await readRemote<WorkspaceResponse>(
    `/api/workspace${context.resource ? `?${context.resource}` : ''}`,
    context,
  );
  if (
    !workspaceSchema.safeParse(result.state).success ||
    !result.actor ||
    typeof result.actor.id !== 'string' ||
    typeof result.actor.name !== 'string' ||
    !['qualite', 'operateur', 'client'].includes(result.actor.role) ||
    !Array.isArray(result.operators) ||
    !result.operators.every(
      (operator) => typeof operator.id === 'string' && typeof operator.name === 'string',
    )
  )
    throw invalidResponse();
  return result;
};
export function FrontendWorkspace({ query }: { query: string }) {
  const path = `/app${query ? `?${query}` : ''}`;
  return (
    <RemoteBootstrap
      resource={query}
      load={loadWorkspace}
      loginPath={`/login?next=${encodeURIComponent(path)}`}
    >
      {(workspace) => (
        <ConsoleApp
          key={`${workspace.actor.id}:${query}`}
          initialState={workspace.state}
          actor={workspace.actor}
          operators={workspace.operators}
          initialPage={workspace.page}
          initialSummary={workspace.summary}
        />
      )}
    </RemoteBootstrap>
  );
}

const loadTeam: Loader<{ account: AccountIdentity; data: TeamPage }> = async (context) => {
  const account = await readAccount(context);
  const data = await readRemote<TeamPage>('/api/team', context);
  if (
    !Array.isArray(data.members) ||
    !Array.isArray(data.invitations) ||
    !Array.isArray(data.clients)
  )
    throw invalidResponse();
  return { account, data };
};
export function FrontendTeam() {
  const { copy } = useLocale();
  return (
    <RemoteBootstrap resource="team" load={loadTeam} loginPath="/login?next=%2Fapp%2Fteam">
      {({ account, data }) => (
        <PortalShell
          quality
          title={copy('Équipe et accès', 'Team and access')}
          description={copy(
            'Invitez vos collaborateurs et les membres de vos organisations clientes. Contrôlez les accès sans modifier l’historique des audits.',
            'Invite colleagues and members of your client organizations. Manage access while preserving the audit history.',
          )}
        >
          <TeamPanel key={account.user.id} initial={data} actorId={account.user.id} />
        </PortalShell>
      )}
    </RemoteBootstrap>
  );
}

const loadRequests: Loader<{ account: AccountIdentity; data: RequestPage }> = async (context) => {
  const account = await readAccount(context);
  const data = await readRemote<RequestPage>('/api/audit-requests', context);
  if (!Array.isArray(data.items)) throw invalidResponse();
  return { account, data };
};
export function FrontendRequests() {
  const { copy } = useLocale();
  return (
    <RemoteBootstrap
      resource="requests"
      load={loadRequests}
      loginPath="/login?next=%2Fapp%2Frequests"
    >
      {({ account, data }) => {
        const quality = account.profile.role === 'qualite';
        return (
          <PortalShell
            quality={quality}
            title={copy('Demandes d’audit', 'Audit requests')}
            description={
              quality
                ? copy(
                    'Examinez les besoins clients, confirmez le périmètre et préparez les scénarios d’intervention.',
                    'Review client needs, confirm the scope and prepare audit scenarios.',
                  )
                : copy(
                    'Décrivez votre besoin et suivez la préparation de votre prochain audit.',
                    'Describe your needs and track the preparation of your next audit.',
                  )
            }
          >
            <RequestsPanel key={account.user.id} initial={data} quality={quality} />
          </PortalShell>
        );
      }}
    </RemoteBootstrap>
  );
}

const loadBilling: Loader<BillingOverview> = async (context) => {
  const data = await readRemote<BillingOverview>('/api/billing', context);
  if (
    typeof data.enabled !== 'boolean' ||
    !Array.isArray(data.plans) ||
    !Array.isArray(data.subscriptions)
  )
    throw invalidResponse();
  return data;
};
export function FrontendBilling({ returned }: { returned: boolean }) {
  return (
    <RemoteBootstrap resource="billing" load={loadBilling} loginPath="/login?next=%2Fapp%2Fbilling">
      {(data) => <Billing initial={data} returned={returned} />}
    </RemoteBootstrap>
  );
}

const loadJoin: Loader<Identity | null> = async (context) => {
  try {
    return await readIdentity(context);
  } catch (error) {
    if (
      error instanceof BootstrapError &&
      (error.status === 401 || error.code === 'EMAIL_NOT_CONFIRMED')
    )
      return null;
    throw error;
  }
};
export function FrontendJoin() {
  const { copy } = useLocale();
  return (
    <RemoteBootstrap resource="join" load={loadJoin}>
      {(identity) => (
        <PortalShell
          title={copy('Bienvenue dans votre équipe', 'Welcome to your team')}
          description={copy(
            'Une invitation vous permet de rejoindre l’organisation ou l’équipe qui vous a donné accès.',
            'Use your invitation to join the organization or team that has given you access.',
          )}
        >
          <JoinPanel key={identity?.user.id ?? 'guest'} email={identity?.user.email ?? null} />
        </PortalShell>
      )}
    </RemoteBootstrap>
  );
}

export function FrontendReset({ next, notice }: { next: string; notice?: string }) {
  return (
    <RemoteBootstrap resource="reset" load={readIdentity} loginPath="/forgot-password">
      {() => (
        <AuthShell>
          <AuthForm mode="reset" configured next={next} notice={notice} />
        </AuthShell>
      )}
    </RemoteBootstrap>
  );
}

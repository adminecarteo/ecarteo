'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Actor, AppState, Command, Role, Localized } from '@/domain/types';
import { translate, localize, type Locale } from './i18n';
import { useLocale } from './locale-context';
import {
  fetchWorkspace,
  submitCommand,
  uncertainOutcome,
  WorkspaceApiError,
  SESSION_EXPIRED_EVENT,
  type WorkspaceOperator,
  type WorkspaceResponse,
} from './workspace-client';
import { workspaceQueryParams, type WorkspacePage, type WorkspaceSummary } from './workspace-query';

export type View =
  | 'tableau'
  | 'scenarios'
  | 'missions'
  | 'notation'
  | 'preuves'
  | 'rapport'
  | 'retest'
  | 'bibliotheque';
export const NAV: { id: View; roles: Role[] }[] = [
  { id: 'tableau', roles: ['qualite', 'client'] },
  { id: 'scenarios', roles: ['qualite'] },
  { id: 'missions', roles: ['qualite', 'operateur'] },
  { id: 'notation', roles: ['qualite'] },
  { id: 'preuves', roles: ['qualite', 'operateur'] },
  { id: 'rapport', roles: ['qualite', 'client'] },
  { id: 'retest', roles: ['qualite', 'client'] },
  { id: 'bibliotheque', roles: ['qualite', 'operateur', 'client'] },
];
export interface ConsoleProviderProps {
  initialState: AppState;
  actor: Actor;
  operators: WorkspaceOperator[];
  initialPage?: WorkspacePage;
  initialSummary?: WorkspaceSummary;
  children: React.ReactNode;
}
type ConsoleContextValue = {
  state: AppState;
  actor: Actor;
  role: Role;
  operators: WorkspaceOperator[];
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, ...args: unknown[]) => string;
  tx: (value: Localized | null | undefined) => string;
  execute: (command: Command) => Promise<{ entityId?: string }>;
  busy: boolean;
  notify: (message: string) => void;
  navigate: (view: View, id?: string) => void;
  view: View;
  selectedId: string | null;
  clientFilter: string;
  setClientFilter: (id: string) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  reload: () => Promise<void>;
  refreshing: boolean;
  refreshError: string;
  prepareSignOut: () => void;
  workspacePage?: WorkspacePage;
  summary?: WorkspaceSummary;
};
const Context = createContext<ConsoleContextValue | null>(null);
export function ConsoleProvider({
  initialState,
  actor: initialActor,
  operators: initialOperators,
  initialPage,
  initialSummary,
  children,
}: ConsoleProviderProps) {
  const [state, setState] = useState(initialState);
  const [actor, setActor] = useState(initialActor);
  const [operators, setOperators] = useState(initialOperators);
  const [workspacePage, setWorkspacePage] = useState(initialPage);
  const [summary, setSummary] = useState(initialSummary);
  const previousResponse = useRef<WorkspaceResponse | undefined>(undefined);
  const { locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [readyIdentity, setReadyIdentity] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const revision = useRef(0);
  const pendingCount = useRef(0);
  const refreshInFlight = useRef(false);
  const commandKeys = useRef(new Map<string, string>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const router = useRouter();
  const params = useSearchParams();
  const queryString = params.toString();
  const role = actor.role;
  const identity = `${actor.id ?? actor.name}:${actor.role}:${actor.clientId ?? ''}`;
  const ready = readyIdentity === identity;
  const requested = params.get('view') ?? 'tableau';
  const view =
    NAV.find((item) => item.id === requested && item.roles.includes(role))?.id ??
    (role === 'operateur' ? 'missions' : 'tableau');
  const requestedClient = params.get('client');
  const clientFilter =
    role === 'client'
      ? (actor.clientId ?? 'all')
      : requestedClient && state.clients.some((client) => client.id === requestedClient)
        ? requestedClient
        : 'all';
  const reload = useCallback(async () => {
    if (refreshInFlight.current || pendingCount.current > 0) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    const startedAt = revision.current;
    try {
      const result = await fetchWorkspace(
        locale,
        workspaceQueryParams(new URLSearchParams(queryString)),
        previousResponse.current,
      );
      if (result.actor.id !== actor.id) {
        setSessionExpired(true);
        return;
      }
      if (startedAt === revision.current && pendingCount.current === 0) {
        setState(result.state);
        setActor(result.actor);
        setOperators(result.operators);
        setWorkspacePage(result.page);
        setSummary(result.summary);
        previousResponse.current = result;
        setRefreshError('');
      }
    } catch (error) {
      if (error instanceof WorkspaceApiError && error.status === 401) setSessionExpired(true);
      else
        setRefreshError(
          error instanceof Error
            ? error.message
            : locale === 'fr'
              ? 'Actualisation impossible.'
              : 'Could not refresh the workspace.',
        );
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [actor.id, locale, queryString]);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('ecarteo:identity') !== identity) {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith('ecarteo:'))
          .forEach((key) => sessionStorage.removeItem(key));
        sessionStorage.setItem('ecarteo:identity', identity);
      }
      const saved = localStorage.getItem('ecarteo-preferences');
      if (saved) {
        const preferences: unknown = JSON.parse(saved);
        if (preferences && typeof preferences === 'object') {
          if (
            'theme' in preferences &&
            (preferences.theme === 'light' || preferences.theme === 'dark')
          )
            setTheme(preferences.theme);
        }
      }
    } catch {
      /* Preferences are optional; workspace data stays on the server. */
    }
    setReadyIdentity(identity);
  }, [identity]);
  useEffect(() => {
    if (!sessionExpired) return;
    commandKeys.current.clear();
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('ecarteo:'))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {}
  }, [sessionExpired]);
  useEffect(() => {
    const expired = () => setSessionExpired(true);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    if (typeof BroadcastChannel !== 'undefined') {
      const current = new BroadcastChannel('ecarteo-workspace');
      channel.current = current;
      current.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'signed-out') setSessionExpired(true);
        else if (event.data === 'changed') void reload();
      };
    }
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      channel.current?.close();
      channel.current = null;
    };
  }, [reload]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = theme;
    document.title = `${translate(locale, `nav_${view}`)} · Écartéo`;
    if (ready) {
      try {
        localStorage.setItem('ecarteo-preferences', JSON.stringify({ locale, theme }));
      } catch {}
    }
  }, [locale, theme, view, ready]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const notify = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 4500);
  }, []);
  const navigate = useCallback(
    (next: View, id?: string) => {
      const query = new URLSearchParams(queryString);
      query.set('view', next);
      query.delete('id');
      if (id) query.set('id', id);
      if (clientFilter !== 'all' && role === 'qualite') query.set('client', clientFilter);
      router.push(`/app?${query}`, { scroll: true });
    },
    [clientFilter, role, router, queryString],
  );
  const execute = useCallback(
    (command: Command): Promise<{ entityId?: string }> => {
      const run = async () => {
        if (sessionExpired)
          throw new WorkspaceApiError(
            locale === 'fr' ? 'Reconnectez-vous pour continuer.' : 'Sign in again to continue.',
            401,
          );
        const fingerprint = JSON.stringify(command);
        const key = commandKeys.current.get(fingerprint) ?? crypto.randomUUID();
        commandKeys.current.set(fingerprint, key);
        pendingCount.current += 1;
        revision.current += 1;
        setPending((value) => value + 1);
        let refreshAfter = false;
        try {
          const result = await submitCommand(
            command,
            key,
            locale,
            workspaceQueryParams(new URLSearchParams(queryString)),
          );
          setState(result.state);
          setWorkspacePage(result.page);
          setSummary(result.summary);
          previousResponse.current = undefined;
          setRefreshError('');
          revision.current += 1;
          commandKeys.current.delete(fingerprint);
          channel.current?.postMessage('changed');
          return { entityId: result.entityId };
        } catch (error) {
          if (!uncertainOutcome(error)) commandKeys.current.delete(fingerprint);
          if (error instanceof WorkspaceApiError && error.status === 401) setSessionExpired(true);
          refreshAfter =
            error instanceof WorkspaceApiError && (error.status === 409 || error.status === 403);
          throw error;
        } finally {
          pendingCount.current -= 1;
          setPending((value) => value - 1);
          if (refreshAfter) void reload();
        }
      };
      const result = queue.current.then(run, run);
      queue.current = result.catch(() => undefined);
      return result;
    },
    [locale, reload, sessionExpired, queryString],
  );
  const prepareSignOut = useCallback(() => {
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('ecarteo:'))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {}
    channel.current?.postMessage('signed-out');
  }, []);
  if (sessionExpired)
    return (
      <main className="boot" role="alert">
        <h1>{locale === 'fr' ? 'Votre session a expiré' : 'Your session has expired'}</h1>
        <p>
          {locale === 'fr'
            ? 'Reconnectez-vous pour retrouver votre espace et continuer votre travail.'
            : 'Sign in again to return to your workspace and continue your work.'}
        </p>
        <Link className="btn primary" href="/login?next=%2Fapp">
          {locale === 'fr' ? 'Se reconnecter' : 'Sign in again'}
        </Link>
      </main>
    );
  if (!ready)
    return (
      <main className="boot" aria-busy="true">
        <div className="brand-boot">ÉCARTÉO</div>
        <span className="loader" />
        <p>{locale === 'fr' ? 'Ouverture de votre espace…' : 'Opening your workspace…'}</p>
      </main>
    );
  return (
    <Context.Provider
      value={{
        state,
        actor,
        role,
        operators,
        locale,
        setLocale,
        theme,
        setTheme,
        t: (key, ...args) => translate(locale, key, ...args),
        tx: (value) => localize(locale, value),
        execute,
        busy: pending > 0,
        notify,
        navigate,
        view,
        selectedId: params.get('id'),
        clientFilter,
        setClientFilter: (id) => {
          const query = new URLSearchParams(params.toString());
          query.set('client', id);
          query.delete('cursor');
          query.delete('id');
          router.replace(`/app?${query}`, { scroll: false });
        },
        reload,
        refreshing,
        refreshError,
        prepareSignOut,
        workspacePage,
        summary,
      }}
    >
      {children}
      <div
        className={`toast ${message ? 'on' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </div>
    </Context.Provider>
  );
}
export function useConsole() {
  const value = useContext(Context);
  if (!value) throw new Error('useConsole must be used inside ConsoleProvider');
  return value;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const backend = vi.hoisted(() => ({
  account: vi.fn(),
  user: vi.fn(),
  workspace: vi.fn(),
  team: vi.fn(),
  requests: vi.fn(),
  billing: vi.fn(),
  configured: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireAccount: backend.account, requireUser: backend.user }));
vi.mock('@/server/workspace', () => ({
  loadWorkspace: backend.workspace,
  WorkspaceError: class extends Error {},
}));
vi.mock('@/server/accounts-requests', () => ({
  listTeam: backend.team,
  listRequests: backend.requests,
}));
vi.mock('@/server/billing', () => ({ loadBilling: backend.billing }));
vi.mock('@/server/config', () => ({ authConfigured: backend.configured }));
vi.mock('@/server/locale', () => ({ getRequestLocale: async () => 'en' }));
vi.mock('@/components/frontend-bootstrap', () => ({
  FrontendWorkspace: 'frontend-workspace',
  FrontendTeam: 'frontend-team',
  FrontendRequests: 'frontend-requests',
  FrontendBilling: 'frontend-billing',
  FrontendJoin: 'frontend-join',
  FrontendReset: 'frontend-reset',
}));
import WorkspacePage from '@/app/app/page';
import TeamPage from '@/app/app/team/page';
import RequestsPage from '@/app/app/requests/page';
import BillingPage from '@/app/app/billing/page';
import JoinPage from '@/app/app/join/page';
import ResetPage from '@/app/reset-password/page';

describe('frontend deployment page boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ECARTEO_DEPLOYMENT_TARGET', 'frontend');
    for (const operation of Object.values(backend))
      operation.mockImplementation(() => {
        throw new Error('Backend work must not execute in the frontend page');
      });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('renders API bootstrap shells for every protected entry without invoking providers or business functions', async () => {
    const pages = await Promise.all([
      WorkspacePage({
        searchParams: Promise.resolve({ view: 'rapport', id: 'mission', q: 'hotel' }),
      }),
      TeamPage(),
      RequestsPage({ searchParams: Promise.resolve({}) }),
      BillingPage({ searchParams: Promise.resolve({ checkout: 'returned' }) }),
      JoinPage(),
      ResetPage({ searchParams: Promise.resolve({ next: '/app', notice: 'ready' }) }),
    ]);
    expect(pages.map((page) => page.type)).toEqual([
      'frontend-workspace',
      'frontend-team',
      'frontend-requests',
      'frontend-billing',
      'frontend-join',
      'frontend-reset',
    ]);
    expect(pages[0].props.query).toBe('view=rapport&id=mission&q=hotel');
    expect(pages[3].props.returned).toBe(true);
    expect(pages[5].props).toMatchObject({ next: '/app', notice: 'ready' });
    for (const operation of Object.values(backend)) expect(operation).not.toHaveBeenCalled();
  });

  it('keeps reset return paths constrained to the application', async () => {
    const result = await ResetPage({
      searchParams: Promise.resolve({ next: 'https://outside.example.test' }),
    });
    expect(result.props.next).toBe('/app');
    expect(backend.user).not.toHaveBeenCalled();
  });
});

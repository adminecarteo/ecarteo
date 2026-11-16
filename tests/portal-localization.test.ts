import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { portalRequest } from '@/lib/portal-client';
import { SESSION_EXPIRED_EVENT } from '@/lib/workspace-client';
import { billingAmount } from '@/lib/billing-format';
import type { RequestPage, TeamPage } from '@/lib/accounts-requests-schema';
import type { BillingOverview } from '@/lib/billing-types';
import { JoinPanel } from '@/components/portal/join-panel';
import { RequestsPanel } from '@/components/portal/requests-panel';
import { TeamPanel } from '@/components/portal/team-panel';
import { PortalShell } from '@/components/portal/portal-shell';
import Billing from '@/features/billing';

const language = vi.hoisted(() => ({ value: 'en' as 'fr' | 'en' }));
vi.mock('@/lib/locale-context', () => ({
  useLocale: () => ({
    locale: language.value,
    copy: (fr: string, en: string) => (language.value === 'fr' ? fr : en),
    setLocale: vi.fn(),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app/requests',
}));

afterEach(() => {
  vi.unstubAllGlobals();
  language.value = 'en';
});

describe('portal language boundary', () => {
  it('sends the selected language on reads and mutations while preserving customer content', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('document', { documentElement: { lang: 'en' } });
    await portalRequest('/api/team');
    await portalRequest('/api/audit-requests', 'POST', { title: 'Qualité du service 客户' });
    const options = fetcher.mock.calls.map(([, init]) => init as RequestInit);
    expect(options.every((init) => new Headers(init.headers).get('Accept-Language') === 'en')).toBe(
      true,
    );
    expect(options[0].body).toBeUndefined();
    expect(JSON.parse(options[1].body as string).title).toBe('Qualité du service 客户');
    expect(new Headers(options[1].headers).get('Content-Type')).toBe('application/json');
    expect(
      options.every((init) => init.credentials === 'same-origin' && init.cache === 'no-store'),
    ).toBe(true);
  });

  it('localizes transport failures and retains the session expiry signal', async () => {
    vi.stubGlobal('document', { documentElement: { lang: 'en' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(portalRequest('/api/billing')).rejects.toThrow('Connection interrupted.');
    vi.stubGlobal('document', { documentElement: { lang: 'fr' } });
    await expect(portalRequest('/api/billing')).rejects.toThrow('Connexion interrompue.');
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: 'Your session has expired.' }, { status: 401 })),
    );
    await expect(portalRequest('/api/team')).rejects.toThrow('Your session has expired.');
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT);
  });

  it.each(['ACCOUNT_DISABLED', 'ACCOUNT_UNAVAILABLE', 'EMAIL_NOT_CONFIRMED'])(
    'invalidates rendered portal data for %s',
    async (code) => {
      const dispatchEvent = vi.fn();
      vi.stubGlobal('window', { dispatchEvent });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(Response.json({ error: 'Access unavailable', code }, { status: 403 })),
      );
      await expect(portalRequest('/api/team')).rejects.toThrow('Access unavailable');
      expect(dispatchEvent).toHaveBeenCalledOnce();
      expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT);
    },
  );

  it('keeps ordinary permission failures local and works without a browser window', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
        ),
    );
    await expect(portalRequest('/api/team')).rejects.toThrow('Forbidden');
    expect(dispatchEvent).not.toHaveBeenCalled();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Expired' }, { status: 401 })),
    );
    await expect(portalRequest('/api/team')).rejects.toThrow('Expired');
  });

  it('invalidates the session even when a 401 response body is malformed', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Expired', { status: 401 })));
    await expect(portalRequest('/api/team')).rejects.toThrow('Réponse invalide');
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT);
  });

  it('formats currency in the selected language without changing Stripe minor-unit conversion', () => {
    expect(billingAmount(1250, 'eur', 'en')).toBe('€12.50');
    expect(billingAmount(1250, 'eur', 'fr')).toContain('12,50');
    expect(billingAmount(1250, 'jpy', 'en')).toContain('1,250');
    expect(billingAmount(1250, 'bhd', 'en')).toContain('1.250');
  });
});

describe('portal and billing translated rendering', () => {
  const request: RequestPage = {
    page: 1,
    pageSize: 25,
    total: 1,
    items: [
      {
        id: 'request',
        clientId: 'client',
        clientName: 'Équipe du client',
        title: 'Demande personnelle',
        sector: 'health',
        channels: ['phone'],
        siteCount: 2,
        preferredDate: '2026-12-10',
        brief: 'Le texte client reste en français.',
        status: 'submitted',
        reviewNote: '',
        scenarioId: null,
        revision: 1,
        createdAt: '2026-11-09T12:00:00Z',
      },
    ],
  };
  const team: TeamPage = {
    page: 1,
    pageSize: 25,
    total: 1,
    clientTotal: 1,
    clients: [{ id: 'client', name: 'Équipe du client' }],
    members: [
      {
        id: 'member',
        name: 'Membre client',
        email: 'member@example.test',
        role: 'client',
        clientId: 'client',
        clientName: 'Équipe du client',
        active: true,
        isClientAdmin: true,
      },
    ],
    invitations: [
      {
        id: 'invite',
        email: 'invite@example.test',
        role: 'operateur',
        clientName: null,
        expiresAt: '2026-12-10T12:00:00Z',
        acceptedAt: null,
        revokedAt: null,
        expired: false,
      },
    ],
  };
  const billing: BillingOverview = {
    enabled: true,
    canManage: true,
    hasCustomer: true,
    pendingCheckout: false,
    plans: [
      {
        id: 'merchant',
        name: 'Offre choisie',
        amount: 1250,
        currency: 'eur',
        interval: 'month',
        intervalCount: 3,
      },
    ],
    subscriptions: [],
  };

  it('renders English navigation, invitation and request forms, preserving client-authored text', () => {
    vi.stubGlobal('React', React);
    const shell = renderToStaticMarkup(
      React.createElement(
        PortalShell,
        {
          title: 'Audit requests',
          description: '',
          quality: true,
        },
        React.createElement(RequestsPanel, { initial: request, quality: false }),
      ),
    );
    expect(shell).toContain('aria-label="Workspace navigation"');
    expect(shell).toMatch(/<a [^>]*aria-current="page"[^>]*>Audit requests<\/a>/);
    expect(shell).toContain('Team and access');
    expect(shell).toContain('aria-label="EN — English"');
    expect(shell).toContain('Request subject');
    expect(shell).toContain('Clinics and private centres');
    expect(shell).toContain('Awaiting review');
    expect(shell).toContain('Le texte client reste en français.');
    expect(shell).not.toContain('Objet de la demande');
    const join = renderToStaticMarkup(React.createElement(JoinPanel, { email: null }));
    expect(join).toContain('Confirm your identity');
    expect(join).toContain('Create an account');
    expect(join).not.toContain('Confirmez votre identité');
  });

  it('renders translated staff controls and subscription options in both languages', () => {
    vi.stubGlobal('React', React);
    const staff = renderToStaticMarkup(
      React.createElement(TeamPanel, { initial: team, actorId: 'other' }),
    );
    expect(staff).toContain('Billing administrator');
    expect(staff).toContain('Save access');
    expect(staff).toContain('Expires on 10/12/2026');
    expect(staff).not.toContain('Inviter un membre');
    const englishBilling = renderToStaticMarkup(React.createElement(Billing, { initial: billing }));
    expect(englishBilling).toContain('Subscription and invoices');
    expect(englishBilling).toContain('€12.50');
    expect(englishBilling).toContain('/ 3 months');
    expect(englishBilling).toContain('Offre choisie');
    language.value = 'fr';
    const frenchBilling = renderToStaticMarkup(React.createElement(Billing, { initial: billing }));
    expect(frenchBilling).toContain('Abonnement et factures');
    expect(frenchBilling).toContain('12,50');
    expect(frenchBilling).toContain('/ 3 mois');
    expect(frenchBilling).not.toContain('Subscription and invoices');
  });
});

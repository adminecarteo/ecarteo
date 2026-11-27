import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ConsentRuntime = typeof import('../src/lib/analytics-consent');
type RegistrationRuntime = typeof import('../src/lib/registration-analytics');
type FakeScript = {
  src?: string;
  id?: string;
  referrerPolicy?: string;
  onload?: (() => void) | null;
  onerror?: (() => void) | null;
  remove: ReturnType<typeof vi.fn>;
};

function fixture(url = 'https://ecarteo.fr/registration-complete') {
  const storage = new Map<string, string>();
  const session = new Map<string, string>();
  const scripts: FakeScript[] = [];
  const commandsAtAppend: unknown[][][] = [];
  const events = new Map<string, (event?: unknown) => void>();
  const cookies = new Map<string, string>();
  const window = {
    location: new URL(url),
    localStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    },
    sessionStorage: { getItem: vi.fn((key: string) => session.get(key) ?? null) },
    fetch: vi.fn(async () => ({
      ok: true,
      json: async () => ({ track: true, next: '/app/requests' }),
    })),
    document: {
      createElement: () => ({ remove: vi.fn() }),
      head: {
        appendChild: (script: FakeScript) => {
          commandsAtAppend.push((window.dataLayer ?? []).map((entry) => Array.from(entry)));
          scripts.push(script);
        },
      },
      get cookie() {
        return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
      },
      set cookie(value: string) {
        if (value.includes('Max-Age=0')) cookies.delete(value.split('=')[0]);
      },
    },
    addEventListener: vi.fn((name: string, callback: (event?: unknown) => void) =>
      events.set(name, callback),
    ),
    removeEventListener: vi.fn((name: string) => events.delete(name)),
    dataLayer: undefined as IArguments[] | undefined,
    'ga-disable-G-X9BFFJ9M78': undefined as boolean | undefined,
  };
  vi.stubGlobal('window', window);
  return {
    window,
    storage,
    session,
    scripts,
    events,
    cookies,
    commandsAtAppend,
    commands: () => (window.dataLayer ?? []).map((entry) => Array.from(entry)),
    analyticsEvents: () =>
      (window.dataLayer ?? [])
        .map((entry) => Array.from(entry))
        .filter((entry) => entry[0] === 'event'),
  };
}

async function flushPromises(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('registration completion analytics', () => {
  let consent: ConsentRuntime;
  let registration: RegistrationRuntime;
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    consent = await import('../src/lib/analytics-consent');
    registration = await import('../src/lib/registration-analytics');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function accept(page: ReturnType<typeof fixture>, expiresAt?: number) {
    const savedAt = expiresAt ? expiresAt - consent.CONSENT_LIFETIME_MS : Date.now() - 1000;
    const record = {
      version: 1,
      analytics: true,
      savedAt,
      expiresAt: savedAt + consent.CONSENT_LIFETIME_MS,
    };
    page.storage.set(consent.CONSENT_STORAGE_KEY, JSON.stringify(record));
    return record;
  }

  function finishEvent(page: ReturnType<typeof fixture>) {
    const event = page.analyticsEvents().find((entry) => entry[1] === 'sign_up');
    (event?.[2] as { event_callback: () => void }).event_callback();
  }

  it('is inert during SSR and on regular login, callback and app pages', async () => {
    await expect(registration.completeRegistration()).resolves.toEqual({ next: '/app' });
    for (const path of ['/login', '/signup', '/auth/callback', '/app', '/']) {
      const page = fixture(`https://ecarteo.fr${path}`);
      accept(page);
      await expect(registration.completeRegistration()).resolves.toEqual({ next: '/app' });
      expect(page.window.fetch).not.toHaveBeenCalled();
      expect(page.scripts).toHaveLength(0);
    }
  });

  it('claims once under StrictMode and sends only sign_up/email after backend approval and tag load', async () => {
    const page = fixture();
    const record = accept(page);
    page.cookies.set('_ga', 'existing-client');
    const first = registration.completeRegistration();
    const second = registration.completeRegistration();
    expect(second).toBe(first);
    expect(page.scripts).toHaveLength(0);
    await flushPromises();
    expect(page.window.fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/analytics/registration',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ consent: record }),
      }),
    );
    expect(page.scripts).toHaveLength(1);
    expect(page.analyticsEvents()).toHaveLength(0);
    expect(page.scripts[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-X9BFFJ9M78');
    expect(page.scripts[0].referrerPolicy).toBe('no-referrer');
    expect(page.commandsAtAppend[0].find((entry) => entry[0] === 'config')?.[2]).toMatchObject({
      send_page_view: false,
      page_location: 'https://ecarteo.fr/registration-complete',
      page_referrer: '',
      cookie_domain: 'none',
      cookie_update: false,
    });
    page.scripts[0].onload?.();
    page.scripts[0].onload?.();
    expect(page.analyticsEvents()).toHaveLength(1);
    const event = page.analyticsEvents()[0];
    expect(event.slice(0, 2)).toEqual(['event', 'sign_up']);
    expect(event[2]).toEqual({
      method: 'email',
      send_to: 'G-X9BFFJ9M78',
      page_location: 'https://ecarteo.fr/registration-complete',
      page_title: 'Écartéo — Inscription confirmée',
      page_referrer: '',
      event_callback: expect.any(Function),
      event_timeout: expect.any(Number),
    });
    finishEvent(page);
    await expect(first).resolves.toEqual({ next: '/app/requests' });
    expect(registration.completeRegistration()).toBe(first);
    expect(page.cookies.get('_ga')).toBe('existing-client');
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
  });

  it.each(['none', 'refused', 'expired', 'invalid'])(
    'consumes the receipt without Google when consent is %s, even if backend returns track:true',
    async (choice) => {
      const page = fixture();
      if (choice === 'refused') consent.saveConsent(false);
      if (choice === 'expired') accept(page, Date.now() - 1);
      if (choice === 'invalid') page.storage.set(consent.CONSENT_STORAGE_KEY, '{invalid');
      const result = registration.completeRegistration();
      await flushPromises();
      await expect(result).resolves.toEqual({ next: '/app/requests' });
      expect(page.window.fetch).toHaveBeenCalledOnce();
      expect(page.scripts).toHaveLength(0);
      expect(page.window.dataLayer).toBeUndefined();
    },
  );

  it('does not load Google when a replay or ordinary account has no eligible receipt', async () => {
    const page = fixture();
    accept(page);
    page.window.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ track: false, next: '/app' }),
    });
    await expect(registration.completeRegistration()).resolves.toEqual({ next: '/app' });
    expect(page.scripts).toHaveLength(0);
  });

  it.each([
    'https://ecarteo-staging-zy4j.onrender.com/registration-complete',
    'http://localhost:3000/registration-complete',
    'http://ecarteo.fr/registration-complete',
    'https://ecarteo.fr/registration-complete?token=private',
    'https://ecarteo.fr/registration-complete#access_token=private',
  ])('never tracks on an unapproved or unclean completion URL: %s', async (url) => {
    const page = fixture(url);
    accept(page);
    await expect(registration.completeRegistration()).resolves.toEqual({ next: '/app/requests' });
    expect(page.scripts).toHaveLength(0);
    expect(page.window.dataLayer).toBeUndefined();
  });

  it('cancels a slow tag on withdrawal, clears cookies and ignores its late load callback', async () => {
    const page = fixture();
    accept(page);
    page.cookies.set('_ga', 'analytics');
    page.cookies.set('sb-auth', 'session');
    const result = registration.completeRegistration();
    await flushPromises();
    const lateLoad = page.scripts[0].onload;
    page.storage.clear();
    page.events.get('storage')?.({ key: consent.CONSENT_STORAGE_KEY });
    await expect(result).resolves.toEqual({ next: '/app/requests' });
    lateLoad?.();
    expect(page.analyticsEvents()).toHaveLength(0);
    expect(page.commands()).toHaveLength(0);
    expect(page.scripts[0].remove).toHaveBeenCalledOnce();
    expect([...page.cookies.keys()]).toEqual(['sb-auth']);
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
  });

  it('still consumes the receipt when consent changes during the claim and never restores the old grant', async () => {
    const page = fixture();
    accept(page);
    let respond!: (value: Awaited<ReturnType<typeof page.window.fetch>>) => void;
    page.window.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const result = registration.completeRegistration();
    await flushPromises();
    page.storage.clear();
    page.events.get('storage')?.({ key: null });
    const request = page.window.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1].signal?.aborted).toBe(false);
    // Re-acceptance after activation cannot revive the conversion claimed with an older proof.
    accept(page);
    respond({ ok: true, json: async () => ({ track: true, next: '/app/requests' }) });
    await expect(result).resolves.toEqual({ next: '/app/requests' });
    expect(page.scripts).toHaveLength(0);
  });

  it('rechecks proof after backend approval and refuses a newer acceptance', async () => {
    const page = fixture();
    accept(page);
    page.window.fetch.mockImplementation(async () => {
      const record = accept(page);
      page.storage.set(
        consent.CONSENT_STORAGE_KEY,
        JSON.stringify({
          ...record,
          savedAt: Date.now(),
          expiresAt: Date.now() + consent.CONSENT_LIFETIME_MS,
        }),
      );
      return { ok: true, json: async () => ({ track: true, next: '/app/requests' }) };
    });
    await expect(registration.completeRegistration()).resolves.toEqual({ next: '/app/requests' });
    expect(page.scripts).toHaveLength(0);
  });

  it('rechecks proof right before event emission even if no storage event fires', async () => {
    const page = fixture();
    accept(page);
    const result = registration.completeRegistration();
    await flushPromises();
    page.storage.clear();
    page.scripts[0].onload?.();
    await expect(result).resolves.toEqual({ next: '/app/requests' });
    expect(page.analyticsEvents()).toHaveLength(0);
  });

  it('stops a pending tag when consent expires', async () => {
    const page = fixture();
    accept(page, Date.now() + 1000);
    const result = registration.completeRegistration();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ next: '/app/requests' });
    expect(page.analyticsEvents()).toHaveLength(0);
    expect(page.scripts[0].remove).toHaveBeenCalledOnce();
  });

  it.each(['claim', 'tag', 'event'])('caps the entire %s flow at three seconds', async (stage) => {
    const page = fixture();
    accept(page);
    if (stage === 'claim') page.window.fetch.mockImplementation(() => new Promise(() => {}));
    const result = registration.completeRegistration();
    await flushPromises();
    if (stage === 'event') page.scripts[0].onload?.();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toEqual({ next: stage === 'claim' ? '/app' : '/app/requests' });
    const request = page.window.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1].signal?.aborted).toBe(true);
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
  });

  it.each(['network', 'http', 'json', 'tag'])(
    'continues to the app after a %s failure',
    async (failure) => {
      const page = fixture();
      accept(page);
      if (failure === 'network') page.window.fetch.mockRejectedValue(new TypeError('Offline'));
      if (failure === 'http')
        page.window.fetch.mockResolvedValue({
          ok: false,
          json: async () => ({ track: false, next: '/app' }),
        });
      if (failure === 'json')
        page.window.fetch.mockResolvedValue({
          ok: true,
          json: async () => {
            throw new SyntaxError('Invalid JSON');
          },
        });
      const result = registration.completeRegistration();
      await flushPromises();
      if (failure === 'tag') page.scripts[0].onerror?.();
      await expect(result).resolves.toEqual({ next: failure === 'tag' ? '/app/requests' : '/app' });
      expect(page.analyticsEvents()).toHaveLength(0);
    },
  );

  it('does not accept a redirect destination outside the protected app allowlist', async () => {
    const page = fixture();
    page.window.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ track: false, next: 'https://example.com' }),
    });
    await expect(registration.completeRegistration()).resolves.toEqual({ next: '/app' });
  });

  it('adds debug_mode only for an explicit session QA flag', async () => {
    const page = fixture();
    accept(page);
    page.session.set('ecarteo.analytics.debug', '1');
    const result = registration.completeRegistration();
    await flushPromises();
    page.scripts[0].onload?.();
    expect(page.analyticsEvents()[0][2]).toHaveProperty('debug_mode', true);
    finishEvent(page);
    await result;
  });
});

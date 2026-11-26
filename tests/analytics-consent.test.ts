import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Runtime = typeof import('../src/lib/analytics-consent');
type FakeScript = {
  id?: string;
  src?: string;
  referrerPolicy?: string;
  onload?: (() => void) | null;
  onerror?: (() => void) | null;
  remove: ReturnType<typeof vi.fn>;
};

function fixture(url = 'https://ecarteo.fr/') {
  const events = new Map<string, (event?: unknown) => void>();
  const storage = new Map<string, string>();
  const scripts: FakeScript[] = [];
  const commandsAtScriptAppend: unknown[][][] = [];
  const cookies = new Map<string, string>();
  const cookieWrites: string[] = [];
  const document = {
    head: {
      appendChild: (script: FakeScript) => {
        commandsAtScriptAppend.push((window.dataLayer ?? []).map((entry) => Array.from(entry)));
        scripts.push(script);
      },
    },
    createElement: () => ({ remove: vi.fn() }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    get cookie() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    set cookie(value: string) {
      cookieWrites.push(value);
      if (value.includes('Max-Age=0')) cookies.delete(value.split('=')[0]);
    },
  };
  const window = {
    location: new URL(url),
    localStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    },
    document,
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
    scripts,
    commandsAtScriptAppend,
    cookies,
    cookieWrites,
    events,
    commands: () => (window.dataLayer ?? []).map((entry) => Array.from(entry)),
    pageViews: () =>
      (window.dataLayer ?? [])
        .map((entry) => Array.from(entry))
        .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view'),
  };
}

describe('public analytics consent', () => {
  let runtime: Runtime;
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T11:00:00Z'));
    runtime = await import('../src/lib/analytics-consent');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is safe during server rendering', () => {
    expect(runtime.readConsent()).toBeNull();
    expect(() => runtime.initializeAnalytics()()).not.toThrow();
    expect(() => runtime.saveConsent(true)).not.toThrow();
  });

  it('does not create a Google queue or load a script before consent or after refusal', () => {
    const page = fixture();
    runtime.initializeAnalytics();
    expect(runtime.readConsent()).toBeNull();
    expect(page.scripts).toHaveLength(0);
    expect(page.window.dataLayer).toBeUndefined();
    runtime.saveConsent(false);
    runtime.trackPublicPage();
    expect(runtime.readConsent()).toBe('refused');
    expect(page.scripts).toHaveLength(0);
    expect(page.window.dataLayer).toBeUndefined();
  });

  it('loads the assigned tag only on acceptance and sends one sanitized page_view after load', () => {
    const page = fixture('https://ecarteo.fr/?email=private@example.com#access_token=secret');
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    expect(page.scripts).toHaveLength(1);
    expect(page.scripts[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-X9BFFJ9M78');
    expect(page.scripts[0].referrerPolicy).toBe('no-referrer');
    expect(page.pageViews()).toHaveLength(0);
    // gtag.js can initialize immediately when executed, before onload. Its first
    // configuration must already suppress automatic views and raw URL capture.
    const initialConfig = page.commandsAtScriptAppend[0].find((entry) => entry[0] === 'config');
    expect(initialConfig?.[2]).toMatchObject({
      send_page_view: false,
      page_location: 'https://ecarteo.fr/',
      page_referrer: '',
    });
    expect(page.commandsAtScriptAppend[0].some((entry) => entry[0] === 'event')).toBe(false);
    page.scripts[0].onload?.();
    runtime.trackPublicPage();
    page.events.get('focus')?.();
    expect(page.pageViews()).toEqual([
      [
        'event',
        'page_view',
        {
          send_to: 'G-X9BFFJ9M78',
          page_location: 'https://ecarteo.fr/',
          page_title: 'Écartéo — Accueil',
          page_referrer: '',
        },
      ],
    ]);
    const config = page.commands().find((entry) => entry[0] === 'config');
    expect(config?.[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_update: false,
      page_referrer: '',
    });
    expect(JSON.stringify(page.commands())).not.toContain('private@example.com');
    expect(JSON.stringify(page.commands())).not.toContain('secret');
  });

  it('withdrawal during script load cancels pending collection even if the script finishes', () => {
    const page = fixture();
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    const lateLoad = page.scripts[0].onload;
    runtime.saveConsent(false);
    expect(page.scripts[0].remove).toHaveBeenCalledOnce();
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
    lateLoad?.();
    expect(page.pageViews()).toHaveLength(0);
    expect(page.commands().filter((entry) => entry[0] === 'config')).toHaveLength(0);
  });

  it('withdrawal removes analytics cookies without removing login or language cookies', () => {
    const page = fixture();
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    page.scripts[0].onload?.();
    page.cookies.set('_ga', 'analytics');
    page.cookies.set('_ga_X9BFFJ9M78', 'session');
    page.cookies.set('sb-auth-token', 'private');
    page.cookies.set('ecarteo-locale', 'fr');
    runtime.saveConsent(false);
    page.window.location = new URL('https://ecarteo.fr/offres');
    runtime.trackPublicPage();
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
    expect(page.pageViews()).toHaveLength(1);
    expect([...page.cookies.keys()]).toEqual(['sb-auth-token', 'ecarteo-locale']);
    expect(page.cookieWrites).toContain(
      '_ga=; Max-Age=0; Path=/; SameSite=Lax; Secure; Domain=.ecarteo.fr',
    );
    expect(page.commands().at(-1)).toEqual([
      'consent',
      'update',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ]);
  });

  it.each([
    'https://ecarteo.fr/login',
    'https://ecarteo.fr/signup',
    'https://ecarteo.fr/app',
    'https://ecarteo.fr/api/reports',
    'https://ecarteo.fr/auth/callback',
    'https://ecarteo-staging-zy4j.onrender.com/',
    'https://ecarteo-public-preview.onrender.com/',
    'http://localhost:3000/',
    'http://ecarteo.fr/',
  ])('never loads analytics on a private page or nonproduction origin: %s', (url) => {
    const page = fixture(url);
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    expect(runtime.readConsent()).toBe('accepted');
    expect(page.scripts).toHaveLength(0);
  });

  it('disables an existing tag on departure from the public shell', () => {
    const page = fixture();
    const cleanup = runtime.initializeAnalytics();
    runtime.saveConsent(true);
    page.scripts[0].onload?.();
    cleanup();
    page.window.location = new URL('https://ecarteo.fr/app?report=private');
    runtime.trackPublicPage();
    expect(page.pageViews()).toHaveLength(1);
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
  });

  it('expires both acceptance and refusal after 180 days and notifies the banner', () => {
    const page = fixture();
    const listener = vi.fn();
    runtime.subscribeConsent(listener);
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    page.scripts[0].onload?.();
    listener.mockClear();
    vi.advanceTimersByTime(runtime.CONSENT_LIFETIME_MS);
    expect(runtime.readConsent()).toBeNull();
    expect(listener).toHaveBeenCalled();
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
    runtime.saveConsent(false);
    vi.advanceTimersByTime(runtime.CONSENT_LIFETIME_MS);
    expect(runtime.readConsent()).toBeNull();
  });

  it('rejects tampered, future-dated, outdated and malformed stored consent', () => {
    const page = fixture();
    const savedAt = Date.now();
    const record = {
      version: 1,
      analytics: true,
      savedAt,
      expiresAt: savedAt + runtime.CONSENT_LIFETIME_MS,
    };
    for (const value of [
      'not JSON',
      JSON.stringify({ ...record, version: 2 }),
      JSON.stringify({ ...record, savedAt: savedAt + 1 }),
      JSON.stringify({ ...record, expiresAt: savedAt + 1_000_000 }),
      JSON.stringify({ ...record, analytics: 'true' }),
    ]) {
      page.storage.set(runtime.CONSENT_STORAGE_KEY, value);
      expect(runtime.readConsent()).toBeNull();
    }
    runtime.initializeAnalytics();
    expect(page.scripts).toHaveLength(0);
  });

  it('honours a refusal in another tab and observes storage being cleared', () => {
    const page = fixture();
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    page.scripts[0].onload?.();
    const stored = JSON.parse(page.storage.get(runtime.CONSENT_STORAGE_KEY)!);
    page.storage.set(runtime.CONSENT_STORAGE_KEY, JSON.stringify({ ...stored, analytics: false }));
    page.events.get('storage')?.({ key: runtime.CONSENT_STORAGE_KEY });
    expect(runtime.readConsent()).toBe('refused');
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
    page.storage.clear();
    page.events.get('storage')?.({ key: null });
    expect(runtime.readConsent()).toBeNull();
  });

  it('honours current-page refusal when storage writes fail over a previously accepted record', () => {
    const page = fixture();
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    page.scripts[0].onload?.();
    page.window.localStorage.setItem.mockImplementation(() => {
      throw new DOMException('Quota exceeded');
    });
    runtime.saveConsent(false);
    expect(runtime.readConsent()).toBe('refused');
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
    expect(page.pageViews()).toHaveLength(1);
    expect(page.storage.has(runtime.CONSENT_STORAGE_KEY)).toBe(false);
  });

  it('does not fail the site when a content blocker prevents the tag loading', () => {
    const page = fixture();
    runtime.initializeAnalytics();
    runtime.saveConsent(true);
    expect(() => page.scripts[0].onerror?.()).not.toThrow();
    expect(page.window['ga-disable-G-X9BFFJ9M78']).toBe(true);
    expect(page.pageViews()).toHaveLength(0);
    expect(runtime.readConsent()).toBe('accepted');
  });
});

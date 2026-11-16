import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
vi.mock('server-only', () => ({}));
import { siteOrigin } from '@/server/config';

const publicConfiguration = {
  APP_URL: 'https://audit.example.test',
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};
const backendConfiguration = {
  ...publicConfiguration,
  DATABASE_URL: 'postgres://fixture:fixture@database.example.test/postgres',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_backend_fixture',
  OPS_HEALTH_TOKEN: 'fixture-monitor-token-32-characters-long',
};
const frontendConfiguration = {
  ...publicConfiguration,
  ECARTEO_DEPLOYMENT_TARGET: 'frontend',
  ECARTEO_BACKEND_ORIGIN: 'https://api.example.test',
};
const privateKeys = [
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_CA_CERT',
  'OPS_HEALTH_TOKEN',
  'OPS_CLEANUP_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_BILLING_PLANS',
];

function validate(env: Record<string, string>, production = true) {
  // No inherited provider environment and no env-file loading: all values are fixtures.
  const result = spawnSync(
    process.execPath,
    ['scripts/validate-config.mjs', ...(production ? ['--production'] : [])],
    { encoding: 'utf8', env: { NODE_ENV: 'test', ...env } },
  );
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

describe('Render fullstack canonical origin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [
      'provider-assigned origin',
      'true',
      'fullstack',
      '',
      'https://assigned.onrender.com',
      'https://assigned.onrender.com',
    ],
    [
      'custom domain override',
      'true',
      'fullstack',
      'https://audit.example.test',
      'https://assigned.onrender.com',
      'https://audit.example.test',
    ],
    [
      'malformed override',
      'true',
      'fullstack',
      'https://audit.example.test/path',
      'https://assigned.onrender.com',
      null,
    ],
    ['insecure provider origin', 'true', 'fullstack', '', 'http://127.0.0.1', null],
    [
      'provider origin with path',
      'true',
      'fullstack',
      '',
      'https://assigned.onrender.com/path',
      null,
    ],
    ['missing provider origin', 'true', 'fullstack', '', '', null],
    ['other host', 'false', 'fullstack', '', 'https://assigned.onrender.com', null],
    ['split backend', 'true', 'backend', '', 'https://assigned.onrender.com', null],
    ['split frontend', 'true', 'frontend', '', 'https://assigned.onrender.com', null],
  ] as const)('%s', (_case, render, target, appUrl, renderUrl, expected) => {
    const env = {
      ...(target === 'frontend' ? frontendConfiguration : backendConfiguration),
      NODE_ENV: 'production',
      RENDER: render,
      ECARTEO_DEPLOYMENT_TARGET: target,
      RENDER_EXTERNAL_URL: renderUrl,
      APP_URL: appUrl,
    };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    expect(validate(env).status).toBe(expected ? 0 : 1);
    if (expected) expect(siteOrigin()).toBe(expected);
    else expect(siteOrigin).toThrow();
  });
});

describe('split deployment configuration boundaries', () => {
  it.each([undefined, '', 'fullstack', 'backend'])(
    'preserves complete backend validation for deployment target %s',
    (target) => {
      const env = {
        ...backendConfiguration,
        ...(target === undefined ? {} : { ECARTEO_DEPLOYMENT_TARGET: target }),
      };
      expect(validate(env).status).toBe(0);
      const missing = validate({
        ...env,
        DATABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        OPS_HEALTH_TOKEN: '',
        OPS_CLEANUP_TOKEN: '',
      });
      expect(missing.status).toBe(1);
      expect(missing.output).toContain('DATABASE_URL: required');
      expect(missing.output).toContain('SUPABASE_SERVICE_ROLE_KEY: required');
      expect(missing.output).toContain('OPS_HEALTH_TOKEN: use at least 32');
    },
  );

  it('accepts a frontend with public configuration and a distinct remote backend, without privileged credentials', () => {
    expect(validate(frontendConfiguration).status).toBe(0);
    expect(
      validate({
        ...frontendConfiguration,
        ...Object.fromEntries(privateKeys.map((key) => [key, ''])),
      }).status,
    ).toBe(0);
    for (const key of [
      'APP_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'ECARTEO_BACKEND_ORIGIN',
    ]) {
      const result = validate({ ...frontendConfiguration, [key]: '' });
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${key}: required`);
    }
  });

  it.each(privateKeys)('rejects %s on a frontend without printing its value', (key) => {
    const value = 'confidential-fixture-value-never-print';
    const result = validate({ ...frontendConfiguration, [key]: value });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${key}: must be absent or blank on a frontend`);
    expect(result.output).not.toContain(value);
    // Do not instruct the frontend user to supply the other forbidden billing values.
    expect(result.output).not.toContain('configure all billing values');
  });

  it.each(['backend', 'fullstack'])(
    'rejects a backend origin on %s to prevent accidental proxy loops',
    (target) => {
      const result = validate({
        ...backendConfiguration,
        ECARTEO_DEPLOYMENT_TARGET: target,
        ECARTEO_BACKEND_ORIGIN: 'https://api.example.test',
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain('only frontend deployments');
    },
  );

  it('rejects unknown targets without echoing their values', () => {
    const result = validate({
      ...backendConfiguration,
      ECARTEO_DEPLOYMENT_TARGET: 'mistyped-private-value',
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain('use fullstack, frontend or backend');
    expect(result.output).not.toContain('mistyped-private-value');
  });

  it.each([
    'http://api.example.test',
    'https://private-user:private-password@api.example.test',
    'https://api.example.test/path',
    'https://api.example.test?private-query=value',
    'https://api.example.test#private-fragment',
    'ftp://api.example.test',
    'https://localhost:8443',
    'http://127.0.0.1:3001',
    'https://[::1]:3001',
    'not-a-url',
  ])('rejects an unsafe or non-production backend origin: %s', (origin) => {
    const result = validate({ ...frontendConfiguration, ECARTEO_BACKEND_ORIGIN: origin });
    expect(result.status).toBe(1);
    expect(result.output).toContain('ECARTEO_BACKEND_ORIGIN:');
    expect(result.output).not.toContain(origin);
  });

  it('allows loopback HTTP only during local development', () => {
    const local = {
      ...frontendConfiguration,
      APP_URL: 'http://127.0.0.1:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
      ECARTEO_BACKEND_ORIGIN: 'http://localhost:3001',
    };
    expect(validate(local, false).status).toBe(0);
    expect(validate(local, true).status).toBe(1);
    expect(
      validate({ ...local, ECARTEO_BACKEND_ORIGIN: 'http://api.example.test' }, false).status,
    ).toBe(1);
  });

  it.each(['https://audit.example.test', 'https://AUDIT.EXAMPLE.TEST:443/'])(
    'rejects a backend matching the normalized public origin: %s',
    (origin) => {
      const result = validate({ ...frontendConfiguration, ECARTEO_BACKEND_ORIGIN: origin });
      expect(result.status).toBe(1);
      expect(result.output).toContain('must differ from APP_URL');
    },
  );

  it('rejects masked provider secrets and invalid published document URLs', () => {
    const result = validate({
      ...backendConfiguration,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_••••••••',
      ECARTEO_PRIVACY_URL: 'https://private@example.test/draft',
      ECARTEO_TERMS_URL: 'http://example.test/terms',
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(result.output).toContain('ECARTEO_PRIVACY_URL');
    expect(result.output).toContain('ECARTEO_TERMS_URL');
    expect(result.output).not.toContain('private@example.test');
  });

  it('continues detecting service credentials accidentally assigned to the public frontend key', () => {
    for (const key of [
      'sb_secret_fixture',
      `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`,
    ]) {
      const result = validate({
        ...frontendConfiguration,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      });
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/secret key exposed|service role key exposed/);
      expect(result.output).not.toContain(key);
    }
  });
});

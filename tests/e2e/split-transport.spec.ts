import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import type { Command } from '../../src/domain/types';

test('split deployment forwards private sessions, rejects foreign mutations and round-trips a 10 MiB operator file', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const accounts = [
    ['qualite', process.env.E2E_QUALITY_EMAIL, process.env.E2E_QUALITY_PASSWORD],
    ['operateur', process.env.E2E_OPERATOR_EMAIL, process.env.E2E_OPERATOR_PASSWORD],
    ['client', process.env.E2E_CLIENT_EMAIL, process.env.E2E_CLIENT_PASSWORD],
  ] as const;
  test.skip(
    process.env.E2E_DEPLOYMENT_TARGET !== 'frontend' ||
      !baseURL ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname) ||
      accounts.some(([, email, password]) => !email || !password) ||
      !process.env.E2E_CLIENT_ID,
    'Requires an isolated local split deployment and all three dedicated account fixtures.',
  );
  const origin = new URL(baseURL!).origin;
  const contexts: BrowserContext[] = [];
  const sessions = new Map<
    string,
    { request: APIRequestContext; userId: string; displayName: string }
  >();
  try {
    for (const [role, email, password] of accounts) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const auth = await context.request.post('/api/auth', {
        headers: { Origin: origin },
        data: { action: 'login', email, password, next: '/app' },
      });
      expect(auth.status()).toBe(200);
      const cookies = (await context.cookies(baseURL)).filter((cookie) =>
        cookie.name.includes('auth-token'),
      );
      expect(cookies.length).toBeGreaterThan(0);
      for (const cookie of cookies) {
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.sameSite).toBe('Lax');
        expect(cookie.domain).toBe(new URL(baseURL!).hostname);
      }
      if (role === 'qualite') {
        // Expire only this isolated test session's cached timestamp. The genuine
        // local-provider refresh token stays unchanged, forcing the backend SDK
        // to refresh it and send replacement cookies through the external rewrite.
        const cookieName = cookies[0].name.replace(/\.\d+$/, '');
        const raw = [...cookies]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((cookie) => cookie.value)
          .join('');
        expect(raw.startsWith('base64-')).toBe(true);
        const session = JSON.parse(Buffer.from(raw.slice(7), 'base64url').toString('utf8'));
        session.expires_at = 1;
        const expired = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
        await context.clearCookies({ name: /auth-token/ });
        const chunks = expired.match(/.{1,3000}/g)!;
        await context.addCookies(
          chunks.map((value, index) => ({
            name: chunks.length === 1 ? cookieName : `${cookieName}.${index}`,
            value,
            url: baseURL!,
            httpOnly: true,
            sameSite: 'Lax' as const,
          })),
        );
        const refreshed = await context.request.get('/api/session?mode=user');
        expect(refreshed.status()).toBe(200);
        expect(
          refreshed.headersArray().some((header) => header.name.toLowerCase() === 'set-cookie'),
        ).toBe(true);
        const renewedCookies = (await context.cookies(baseURL)).filter((cookie) =>
          cookie.name.includes('auth-token'),
        );
        expect(renewedCookies.every((cookie) => cookie.httpOnly)).toBe(true);
        const renewed = renewedCookies
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((cookie) => cookie.value)
          .join('');
        const renewedSession = JSON.parse(
          Buffer.from(renewed.slice(7), 'base64url').toString('utf8'),
        );
        expect(renewedSession.expires_at > Date.now() / 1000).toBe(true);
      }
      const response = await context.request.get('/api/session');
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['vary']).toContain('Cookie');
      const identity = await response.json();
      expect(identity.profile.role).toBe(role);
      expect(identity.user.email).toBe(email);
      expect(Object.keys(identity.user).sort()).toEqual(['email', 'id']);
      const userOnly = await (await context.request.get('/api/session?mode=user')).json();
      expect(userOnly).toEqual({ user: identity.user });
      sessions.set(role, {
        request: context.request,
        userId: identity.user.id,
        displayName: identity.profile.display_name,
      });
    }
    const quality = sessions.get('qualite')!;
    const operator = sessions.get('operateur')!;
    const client = sessions.get('client')!;
    const foreignHeaders: Record<string, string>[] = [
      { Origin: 'https://foreign.example.test' },
      { Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
      {},
    ];
    for (const headers of foreignHeaders) {
      const denied = await quality.request.post('/api/commands', { headers, data: {} });
      expect(denied.status()).toBe(403);
      expect((await denied.json()).code).toBe('INVALID_ORIGIN');
    }
    async function command(request: APIRequestContext, value: Command) {
      const response = await request.post('/api/commands', {
        headers: { Origin: origin },
        data: { command: value, idempotencyKey: randomUUID() },
      });
      expect(response.status()).toBe(200);
      return response.json();
    }
    const title = `TEST split upload ${randomUUID().slice(0, 8)} — simulated only`;
    const created = await command(quality.request, {
      type: 'scenario.create',
      draft: {
        clientId: process.env.E2E_CLIENT_ID!,
        title,
        family: 'info',
        objective: 'Verify the local frontend/backend upload transport.',
        channels: ['email'],
        lang: 'EN',
        persona: 'Fictional software acceptance tester.',
        steps: [{ label: 'Store the synthetic text file.', seuil: 'Exact byte equality.' }],
        evidence: [],
        limits: 'Local software test only; no external contact or real customer data.',
      },
    });
    await command(quality.request, { type: 'scenario.approve', id: created.entityId });
    const mission = await command(quality.request, {
      type: 'mission.create',
      scenarioId: created.entityId,
      date: '2030-11-15',
      operator: operator.userId,
    });
    await command(operator.request, { type: 'mission.timer', id: mission.entityId, running: true });
    const bytes = Buffer.alloc(10 * 1024 * 1024, 'A');
    const upload = await operator.request.post('/api/attachments', {
      headers: { Origin: origin },
      multipart: {
        missionId: mission.entityId,
        file: { name: 'synthetic-10-mib.txt', mimeType: 'text/plain', buffer: bytes },
      },
    });
    expect(upload.status()).toBe(201);
    const attachment = await upload.json();
    expect(attachment.size).toBe(bytes.length);
    await command(operator.request, {
      type: 'evidence.add',
      missionId: mission.entityId,
      evidence: {
        type: 'fichier',
        label: 'TEST synthetic 10 MiB transport proof',
        text: 'Synthetic bytes only. No real personal data.',
        ...attachment,
      },
    });
    const downloaded = await operator.request.get(`/api/attachments/${attachment.fileId}`);
    expect(downloaded.status()).toBe(200);
    const actual = await downloaded.body();
    expect(actual.length).toBe(bytes.length);
    expect(createHash('sha256').update(actual).digest('hex')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    // Unpublished operator evidence must remain inaccessible to the customer.
    expect((await client.request.get(`/api/attachments/${attachment.fileId}`)).status()).toBe(404);
    const oversized = await operator.request.post('/api/attachments', {
      headers: { Origin: origin },
      multipart: {
        missionId: mission.entityId,
        file: {
          name: 'synthetic-over-limit.txt',
          mimeType: 'text/plain',
          buffer: Buffer.alloc(bytes.length + 1, 'B'),
        },
      },
    });
    expect(oversized.status()).toBe(400);
    expect((await oversized.json()).code).toBe('INVALID_FILE');
    await command(operator.request, {
      type: 'mission.timer',
      id: mission.entityId,
      running: false,
    });
  } finally {
    // Closing isolated browser contexts does not revoke the user's other sessions.
    await Promise.all(contexts.map((context) => context.close()));
  }
});

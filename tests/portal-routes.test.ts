import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  user: vi.fn(),
  invite: vi.fn(),
  accept: vi.fn(),
  createRequest: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireAccount: mocks.account, requireUser: mocks.user }));
vi.mock('@/server/accounts-requests', () => ({
  createInvitation: mocks.invite,
  acceptInvitation: mocks.accept,
  createRequest: mocks.createRequest,
}));
import { POST as invite } from '@/app/api/team/route';
import { POST as accept } from '@/app/api/invitations/accept/route';
import { POST as createRequest } from '@/app/api/audit-requests/route';
const request = (body: unknown, origin = 'http://127.0.0.1:3000') =>
  new Request('http://127.0.0.1:3000/api/team', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('portal mutation boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = 'http://127.0.0.1:3000';
    mocks.account.mockResolvedValue({ user: { id: 'server-verified-id' } });
    mocks.user.mockResolvedValue({ user: { id: 'verified-unprovisioned-id' } });
  });
  it('rejects cross-site invitations and intake before querying identity or database', async () => {
    expect((await invite(request({}, 'https://attacker.test'))).status).toBe(403);
    expect((await createRequest(request({}, 'https://attacker.test'))).status).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it('uses verified identity, no-store responses, and lets confirmed invitees redeem without a profile', async () => {
    mocks.invite.mockResolvedValue({ url: 'http://127.0.0.1:3000/app/join#private-token' });
    const response = await invite(request({ email: 'user@example.test' }));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.invite).toHaveBeenCalledWith('server-verified-id', { email: 'user@example.test' });
    mocks.accept.mockResolvedValue({ redirect: '/app' });
    expect(
      (await accept(request({ token: 'one-time-token', displayName: 'Invitee' }))).status,
    ).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith('verified-unprovisioned-id', {
      token: 'one-time-token',
      displayName: 'Invitee',
    });
  });
});

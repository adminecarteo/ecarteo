import { createAuthClient } from '@/server/auth';
import { siteOrigin } from '@/server/config';
import { privateHeaders } from '@/server/http';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  let destination = '/login?notice=invalid-link';
  try {
    if (
      tokenHash &&
      tokenHash.length < 2048 &&
      (type === 'signup' || type === 'recovery' || type === 'email')
    ) {
      const client = await createAuthClient();
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) destination = type === 'recovery' ? '/reset-password' : '/app';
    }
  } catch {
    /* No token/provider diagnostics belong in the redirect. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      ...privateHeaders,
      'Referrer-Policy': 'no-referrer',
      Location: new URL(destination, siteOrigin()).toString(),
    },
  });
}

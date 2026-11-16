import { safeNext } from '@/lib/auth-schema';
import { createAuthClient } from '@/server/auth';
import { siteOrigin } from '@/server/config';
import { confirmedSignupPath } from '@/lib/audit-offer';
import { privateHeaders } from '@/server/http';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  let destination = '/login?notice=invalid-link';
  try {
    if (code && code.length < 2048) {
      const client = await createAuthClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error)
        destination =
          url.searchParams.get('next') === '/reset-password'
            ? '/reset-password'
            : safeNext(
                url.searchParams.get('next') ??
                  confirmedSignupPath(data.user?.user_metadata?.audit_offer),
              );
    }
  } catch {
    /* Expired/invalid links use the same public message. */
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

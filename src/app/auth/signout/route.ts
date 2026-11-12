import { createAuthClient } from '@/server/auth';
import { siteOrigin } from '@/server/config';
import { apiError, assertSameOrigin, privateHeaders } from '@/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const client = await createAuthClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return new Response(null, {
      status: 303,
      headers: { ...privateHeaders, Location: `${siteOrigin()}/login?notice=signed-out` },
    });
  } catch (error) {
    return apiError(error, request);
  }
}

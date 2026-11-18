import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest, type ProxyConfig } from 'next/server';
import { deploymentTarget, isFrontendDeployment } from '@/lib/deployment-target';

export async function proxy(request: NextRequest) {
  // Activate only at the coordinated production cutover, before an old email
  // link can redeem its token and set a session cookie on the previous host.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.APP_URL === 'https://ecarteo.fr' &&
    deploymentTarget() === 'fullstack' &&
    ['GET', 'HEAD'].includes(request.method) &&
    ['app.ecarteo.fr', 'www.ecarteo.fr'].includes(request.headers.get('host')?.toLowerCase() ?? '')
  ) {
    const destination = new URL('https://ecarteo.fr');
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    const redirect = NextResponse.redirect(destination, 301);
    redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
    redirect.headers.set('Referrer-Policy', 'no-referrer');
    return redirect;
  }

  let response = NextResponse.next({ request });
  // The extra host matcher covers public pages and email links only for the
  // canonical redirect. Keep session refresh scoped to its original pages.
  if (
    request.nextUrl.pathname !== '/app' &&
    !request.nextUrl.pathname.startsWith('/app/') &&
    request.nextUrl.pathname !== '/reset-password'
  )
    return response;
  // Split deployments authenticate through browser-facing Render API responses.
  if (isFrontendDeployment()) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  // Fresh verification and authorization also happen at every protected data boundary.
  await client.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
export const config = {
  // Uploads must not enter Vercel Routing Middleware before the native external
  // rewrite. Auth handlers still refresh their own cookies after canonicalization.
  matcher: [
    '/app/:path*',
    '/reset-password',
    {
      source: '/((?!api(?:/|$)|_next(?:/|$)).*)',
      has: [{ type: 'host', value: '(?:app|www)\\.ecarteo\\.fr' }],
    },
  ],
} satisfies ProxyConfig;

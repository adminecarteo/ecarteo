import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isFrontendDeployment } from '@/lib/deployment-target';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
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
  // API/auth handlers refresh their own cookies. In particular, uploads must not
  // enter Vercel Routing Middleware before the native external rewrite.
  matcher: ['/app/:path*', '/reset-password'],
};

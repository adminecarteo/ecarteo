import type { NextConfig } from 'next';
import { backendOrigin, isFrontendDeployment } from './src/lib/deployment-target';

const apiOrigin = backendOrigin();
const config: NextConfig = {
  // A separate cache permits a real local provider acceptance server alongside normal development.
  distDir: isFrontendDeployment()
    ? '.next-frontend'
    : process.env.ECARTEO_LOCAL_QA === '1'
      ? '.next-qa'
      : '.next',
  reactStrictMode: true,
  output: 'standalone',
  experimental: { proxyClientMaxBodySize: '12mb' },
  async rewrites() {
    // beforeFiles prevents the colocated backend handlers from running on Vercel.
    // Native external rewrites keep upload bytes outside Vercel Functions.
    return {
      beforeFiles: apiOrigin
        ? [
            { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
            { source: '/auth/:path*', destination: `${apiOrigin}/auth/:path*` },
          ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      ...(apiOrigin
        ? ['/api/:path*', '/auth/:path*'].map((source) => ({
            source,
            headers: [
              { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
              { key: 'Vary', value: 'Cookie' },
              { key: 'x-vercel-enable-rewrite-caching', value: '0' },
            ],
          }))
        : []),
      // These redirects receive credentials in their query strings. Keep this
      // rule after the site default so Next also omits the referrer on redirects.
      {
        source: '/auth/:action(callback|confirm)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      ...['/registration-complete', '/api/analytics/registration'].map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Vary', value: 'Cookie' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      })),
    ];
  },
};
export default config;

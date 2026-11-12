import type { NextConfig } from 'next';
const config: NextConfig = {
  // A separate cache permits a real local provider acceptance server alongside normal development.
  distDir: process.env.ECARTEO_LOCAL_QA === '1' ? '.next-qa' : '.next',
  reactStrictMode: true,
  output: 'standalone',
  experimental: { proxyClientMaxBodySize: '12mb' },
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
    ];
  },
};
export default config;

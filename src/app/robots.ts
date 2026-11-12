import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/methode', '/offres'],
      disallow: [
        '/app',
        '/api/',
        '/auth/',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
      ],
    },
  };
}

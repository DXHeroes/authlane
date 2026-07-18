import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/connect/', '/login/', '/register/', '/dashboard/'],
    },
    sitemap: 'https://authlane.io/sitemap.xml',
    host: 'https://authlane.io',
  };
}

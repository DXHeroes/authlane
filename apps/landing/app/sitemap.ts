import type { MetadataRoute } from 'next';
import { getAllDocs } from './lib/docs';
import { getPublicDocUrl } from './lib/docs-public-route.mjs';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = [...new Set(getAllDocs().map((doc) => getPublicDocUrl(doc.slug)))].map((url) => ({
    url,
    changeFrequency: 'weekly' as const,
    priority: url === 'https://authlane.io/docs' ? 0.9 : url.endsWith('/api-reference') ? 0.8 : 0.7,
  }));

  return [
    {
      url: 'https://authlane.io/',
      changeFrequency: 'monthly',
      priority: 1,
    },
    ...docs,
  ];
}

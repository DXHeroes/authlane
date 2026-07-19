import type { MetadataRoute } from 'next';
import { getAllDocs } from './lib/docs';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = [
    ...new Set(
      getAllDocs().map((doc) =>
        doc.slug === 'introduction'
          ? 'https://authlane.io/docs'
          : `https://authlane.io/docs/${doc.slug}`
      )
    ),
  ].map((url) => ({
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

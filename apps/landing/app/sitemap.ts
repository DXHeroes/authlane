import type { MetadataRoute } from 'next';
import { getAllDocs } from './lib/docs';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getAllDocs().map((doc) => ({
    url: `https://authlane.io/docs/${doc.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: 'https://authlane.io/',
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: 'https://authlane.io/docs',
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://authlane.io/docs/api-reference',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...docs,
  ];
}

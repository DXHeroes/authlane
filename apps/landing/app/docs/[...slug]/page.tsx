import type { Metadata } from 'next';
import { DocsMdx, DocsPage } from '../../components/docs-page';
import { getAllDocs, getDoc } from '../../lib/docs';
import { getPublicDocUrl } from '../../lib/docs-public-route.mjs';

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllDocs()
    .filter((doc) => doc.slug !== 'introduction' && doc.slug !== 'api-reference')
    .map((doc) => ({ slug: doc.slug.split('/') }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const doc = getDoc(slug.join('/'));
    const url = getPublicDocUrl(doc.slug);
    return {
      title: `${doc.title} — Authlane`,
      description: doc.description,
      alternates: { canonical: url },
      openGraph: { title: doc.title, description: doc.description, url, type: 'article' },
    };
  });
}

export default async function DocumentationPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const doc = getDoc(slug.join('/'));
  return (
    <DocsPage doc={doc}>
      <DocsMdx doc={doc} />
    </DocsPage>
  );
}

import type { Metadata } from 'next';
import { DocsMdx, DocsPage } from '../../components/docs-page';
import { getAllDocs, getDoc } from '../../lib/docs';

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug.split('/') }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const doc = getDoc(slug.join('/'));
    const url = `https://authlane.io/docs/${doc.slug}`;
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

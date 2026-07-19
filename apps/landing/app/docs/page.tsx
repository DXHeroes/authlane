import type { Metadata } from 'next';
import { DocsMdx, DocsPage } from '../components/docs-page';
import { getDoc } from '../lib/docs';
import { getPublicDocUrl } from '../lib/docs-public-route.mjs';

const doc = getDoc('introduction');
const url = getPublicDocUrl(doc.slug);

export const metadata: Metadata = {
  title: 'Documentation — Authlane',
  description: doc.description,
  alternates: { canonical: url },
  openGraph: {
    title: 'Authlane documentation',
    description: doc.description,
    url,
    type: 'website',
  },
};

export default function DocsHome() {
  return (
    <DocsPage doc={doc}>
      <DocsMdx doc={doc} />
    </DocsPage>
  );
}

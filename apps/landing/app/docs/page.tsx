import type { Metadata } from 'next';
import { DocsMdx, DocsPage } from '../components/docs-page';
import { getDoc } from '../lib/docs';

const doc = getDoc('introduction');

export const metadata: Metadata = {
  title: 'Documentation — Authlane',
  description: doc.description,
  alternates: { canonical: 'https://authlane.io/docs' },
  openGraph: {
    title: 'Authlane documentation',
    description: doc.description,
    url: 'https://authlane.io/docs',
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

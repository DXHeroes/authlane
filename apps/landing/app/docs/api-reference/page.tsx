import type { Metadata } from 'next';
import { SiteFooter } from '../../components/site-footer';
import { SiteHeader } from '../../components/site-header';
import { getDoc } from '../../lib/docs';
import { getPublicDocUrl } from '../../lib/docs-public-route.mjs';
import { ApiReferenceClient } from './api-reference-client';

const doc = getDoc('api-reference');
const url = getPublicDocUrl(doc.slug);

export const metadata: Metadata = {
  title: 'API reference — Authlane',
  description: doc.description,
  alternates: { canonical: url },
  openGraph: {
    title: 'Authlane API reference',
    description: doc.description,
    url,
    type: 'website',
  },
};

export default function ApiReferencePage() {
  return (
    <div className="site-shell api-reference-site-shell antialiased isolate">
      <a className="skip-link" href="#api-reference-content">
        Skip to API reference
      </a>
      <SiteHeader navigationVariant="absolute" />
      <main id="api-reference-content" className="api-reference-page container">
        <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/docs">Docs</a>
            </li>
            <li aria-current="page">{doc.title}</li>
          </ol>
        </nav>

        <header className="api-reference-header">
          <p className="mono eyebrow">Documentation</p>
          <h1>{doc.title}</h1>
          <p>{doc.description}</p>
        </header>

        <aside className="api-reference-warning" aria-label="Security warning">
          Read-only API reference. Never paste an Authlane API key into browser tools.
        </aside>

        <nav className="api-reference-actions" aria-label="OpenAPI specification files">
          <a href="/docs/openapi.yaml">OpenAPI YAML</a>
          <a href="/docs/openapi.json">OpenAPI JSON</a>
        </nav>

        <section className="authlane-api-reference" aria-label="Authlane OpenAPI reference">
          <output className="api-reference-fallback" aria-live="polite" aria-atomic="true">
            <strong>Loading the interactive API reference…</strong>
            <p>
              The complete OpenAPI contract remains available from the YAML and JSON downloads
              above.
            </p>
          </output>
          <ApiReferenceClient />
        </section>
      </main>
      <SiteFooter navigationVariant="absolute" />
    </div>
  );
}

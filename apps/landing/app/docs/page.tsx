import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '../components/site-footer';
import { SiteHeader } from '../components/site-header';

const quickstartSteps = [
  {
    index: '01',
    title: 'Create a server client',
    description: 'Initialize Authlane in trusted backend code. Keep the tenant API key there.',
  },
  {
    index: '02',
    title: 'Load enabled services',
    description: 'Read the safe service catalog and compose the integrations UI in your product.',
  },
  {
    index: '03',
    title: 'Connect an external user',
    description: 'Create a short-lived session bound to the signed-in user, services, and origin.',
  },
  {
    index: '04',
    title: 'Execute tools locally',
    description:
      'Scope the user, choose a framework adapter, and call providers from your runtime.',
  },
] as const;

const documentationLinks = [
  {
    title: 'TypeScript SDK',
    description: 'Server client, resources, non-throwing results, and user-scoped tools.',
    href: 'https://app.authlane.io/docs/sdk/typescript',
  },
  {
    title: 'React',
    description: 'Hosted connect UI for tenant-owned product experiences.',
    href: 'https://app.authlane.io/docs/sdk/react',
  },
  {
    title: 'Security',
    description: 'Credential storage, leases, tenant boundaries, and operational controls.',
    href: 'https://app.authlane.io/docs/guides/security',
  },
  {
    title: 'OAuth setup',
    description: 'Provider configuration, callback routes, PKCE, and consent sessions.',
    href: 'https://app.authlane.io/docs/guides/oauth-setup',
  },
  {
    title: 'Self-hosting',
    description: 'Run the Authlane application with PostgreSQL and Redis.',
    href: 'https://app.authlane.io/docs/guides/self-hosting',
  },
] as const;

export const metadata: Metadata = {
  title: 'Build with Authlane',
  description:
    'Start with the Authlane SDK, hosted connect, security model, and self-hosting docs.',
  alternates: { canonical: '/docs/' },
  robots: { index: false, follow: true },
};

export default function DocsEntry() {
  return (
    <div className="site-shell docs-shell antialiased">
      <SiteHeader />
      <main id="main-content" className="isolate">
        <section className="docs-hero section-shell" aria-labelledby="docs-title">
          <div className="container docs-hero__layout">
            <div className="section-heading">
              <p className="mono eyebrow">Documentation entry</p>
              <h1 id="docs-title">Build with Authlane</h1>
              <p className="section-heading__description">
                Move from an enabled service catalog to user-scoped tools while provider traffic
                stays in your trusted runtime.
              </p>
            </div>
            <p className="mono docs-hero__route">app.authlane.io/docs</p>
          </div>
        </section>

        <section className="docs-quickstart section-shell" aria-labelledby="quickstart-title">
          <div className="container">
            <div className="section-heading">
              <p className="mono eyebrow">Quickstart</p>
              <h2 id="quickstart-title">From catalog to local execution</h2>
              <p className="section-heading__description">
                Identity is explicit at every step. Authlane coordinates connection state and tool
                definitions; your application owns the product UI and provider calls.
              </p>
            </div>
            <ol className="docs-steps" aria-label="Authlane quickstart steps">
              {quickstartSteps.map((step) => (
                <li key={step.index}>
                  <p className="mono docs-step__index">{step.index}</p>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="docs-directory section-shell" aria-labelledby="directory-title">
          <div className="container docs-directory__layout">
            <div className="section-heading">
              <p className="mono eyebrow">Reference paths</p>
              <h2 id="directory-title">Choose the boundary you are building</h2>
              <p className="section-heading__description">
                The full documentation is served with the authenticated product at app.authlane.io.
              </p>
            </div>
            <dl className="docs-links">
              {documentationLinks.map((item) => (
                <div key={item.title}>
                  <dt>
                    <Link href={item.href}>{item.title}</Link>
                  </dt>
                  <dd>{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="docs-source section-shell" aria-labelledby="source-title">
          <div className="container docs-source__layout">
            <div>
              <p className="mono eyebrow">Documentation source</p>
              <h2 id="source-title">Read and improve the repository docs</h2>
            </div>
            <Link
              className="secondary-action secondary-action--outlined"
              href="https://github.com/dxheroes/authlane/tree/main/apps/docs"
            >
              Open documentation source
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

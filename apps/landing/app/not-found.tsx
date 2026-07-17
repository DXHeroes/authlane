import Link from 'next/link';
import { SiteFooter } from './components/site-footer';
import { SiteHeader } from './components/site-header';

export default function NotFound() {
  return (
    <div className="site-shell not-found-shell antialiased">
      <SiteHeader navigationVariant="absolute" />
      <main id="main-content" className="isolate not-found-main">
        <section className="container not-found-panel" aria-labelledby="not-found-title">
          <p className="mono eyebrow">404 / Route not found</p>
          <h1 id="not-found-title">This path is outside the public surface</h1>
          <p>
            Authlane&apos;s public site stays deliberately small. Product, API, connect, dashboard,
            and full documentation routes live at app.authlane.io.
          </p>
          <Link className="secondary-action secondary-action--outlined" href="https://authlane.io/">
            Return to Authlane
          </Link>
        </section>
      </main>
      <SiteFooter navigationVariant="absolute" />
    </div>
  );
}

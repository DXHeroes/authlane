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
            This route does not exist. Documentation lives under authlane.io/docs; the dashboard,
            hosted connect flow, and API live at app.authlane.io.
          </p>
          <a className="secondary-action secondary-action--outlined" href="https://authlane.io/">
            Return to Authlane
          </a>
        </section>
      </main>
      <SiteFooter navigationVariant="absolute" />
    </div>
  );
}

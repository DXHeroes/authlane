/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
import { DeveloperJourney } from './components/developer-journey';
import { MarketingSections } from './components/marketing-sections';
import { RequestFlow } from './components/request-flow';
import { SiteFooter } from './components/site-footer';
import { SiteHeader } from './components/site-header';
import { landingLinks } from './content';

export default function Home() {
  return (
    <div className="site-shell antialiased">
      {/* The documentation had one of these; the marketing pages did not, so keyboard
          users tabbed through the whole header on every visit. */}
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="isolate">
        <section className="hero section-shell" aria-labelledby="hero-title">
          <div className="container hero__layout">
            <div className="hero__content">
              <p className="mono eyebrow">The control plane for connected tools</p>
              <h1 id="hero-title">Connected tools. Your traffic.</h1>
              <p className="hero__description">
                Give every signed-in user a connected toolset without putting Authlane between your
                runtime and provider APIs. Load the catalog, start Authlane&apos;s hosted connect
                flow, then execute directly from your trusted SaaS runtime.
              </p>
              <div className="hero__actions">
                <a className="primary-action" href={landingLinks.app} data-primary-cta>
                  Start building
                </a>
                <a className="secondary-action secondary-action--outlined" href={landingLinks.docs}>
                  Read the docs
                </a>
              </div>
              <ul className="hero-facts" role="list" aria-label="Authlane product facts">
                <li className="mono">One API</li>
                <li className="mono">User-scoped tools</li>
                <li className="mono">No provider proxy</li>
              </ul>
            </div>
            <RequestFlow />
          </div>
        </section>

        <DeveloperJourney />
        <MarketingSections />
      </main>
      <SiteFooter />
    </div>
  );
}

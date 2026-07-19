/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
import { landingLinks, serviceGroups } from '../content';

const securityBoundaries = [
  {
    title: 'Server-only API key',
    description: 'Tenant API keys stay in trusted server-side code and never enter the browser.',
  },
  {
    title: 'Bound connect session',
    description:
      'OAuth starts from a short-lived session scoped to one tenant, user, service allowlist, and exact parent origin.',
  },
  {
    title: 'Encrypted refresh material',
    description: 'Refresh and ID tokens remain encrypted inside the Authlane control plane.',
  },
  {
    title: 'Just-in-time access lease',
    description:
      'A local executor requests short-lived, access-only material only when a selected tool runs, never while definitions or status are listed.',
  },
  {
    title: 'Direct provider route',
    description:
      'Provider requests and responses stay between your trusted SaaS runtime and the provider API.',
  },
  {
    title: 'Audit trail',
    description: 'Credential access is recorded for tenant-scoped operational review.',
  },
] as const;

export function MarketingSections() {
  return (
    <>
      <section
        id="product"
        className="product-boundary section-shell"
        aria-labelledby="product-title"
      >
        <div className="container">
          <div className="section-heading">
            <p className="mono eyebrow">Product boundary</p>
            <h2 id="product-title">Keep the control plane thin</h2>
            <p className="section-heading__description">
              Authlane holds connection state and tool definitions. It does not sit between your
              application and provider APIs.
            </p>
          </div>

          <div className="boundary-layout">
            <dl className="boundary-definitions">
              <div>
                <dt>Control-plane reads</dt>
                <dd>
                  Your server reads enabled services, live connection states, and immutable tool
                  definition versions from Authlane. Listing them does not issue a credential lease.
                </dd>
              </div>
              <div>
                <dt>Provider traffic</dt>
                <dd>
                  At tool execution, your local adapter requests a scoped access lease and calls the
                  provider directly. Authlane never receives the provider request or response body.
                </dd>
              </div>
            </dl>

            <aside className="performance-target" aria-labelledby="performance-target-title">
              <p className="mono performance-target__label">Design target</p>
              <h3 id="performance-target-title" className="tabular-nums">
                P95 100 ms
              </h3>
              <p>
                Hot capability and connection-state reads are designed for this target under the
                defined benchmark conditions. It is not presented as a measured production
                guarantee.
              </p>
              <ul className="status-list" role="list" aria-label="Effective connection states">
                {['connected', 'disconnected', 'expired', 'error'].map((status) => (
                  <li key={status} className="mono">
                    {status}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section
        id="security"
        className="security-boundary section-shell"
        aria-labelledby="security-title"
      >
        <div className="container">
          <div className="section-heading">
            <p className="mono eyebrow">Security boundaries</p>
            <h2 id="security-title">Secrets stay behind explicit trust boundaries</h2>
            <p className="section-heading__description">
              Browser-safe connection setup and server-only execution use separate, narrowly scoped
              credentials.
            </p>
          </div>

          <dl className="security-boundaries">
            {securityBoundaries.map((boundary) => (
              <div key={boundary.title} className="security-boundary__item">
                <dt>{boundary.title}</dt>
                <dd>{boundary.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        id="integrations"
        className="integration-catalog section-shell"
        aria-labelledby="integrations-title"
      >
        <div className="container">
          <div className="section-heading">
            <p className="mono eyebrow">Built-in catalog</p>
            <h2 id="integrations-title">The integrations shipped in the repository</h2>
            <p className="section-heading__description">
              Service availability, authentication methods, and tool coverage can differ. This is
              the factual built-in catalog, grouped by use case.
            </p>
          </div>

          <div className="integration-groups">
            {serviceGroups.map((group) => (
              <section
                key={group.name}
                className="integration-group"
                aria-labelledby={`integration-${group.name.toLowerCase().replaceAll(' ', '-')}`}
              >
                <h3 id={`integration-${group.name.toLowerCase().replaceAll(' ', '-')}`}>
                  {group.name}
                </h3>
                <ul role="list">
                  {group.services.map((service) => (
                    <li key={service.id} data-service-id={service.id}>
                      <span>{service.name}</span>
                      <code className="mono">{service.id}</code>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section
        id="self-hosting"
        className="deployment-section section-shell"
        aria-labelledby="deployment-title"
      >
        <div className="container deployment-section__layout">
          <div className="section-heading">
            <p className="mono eyebrow">One deployment boundary</p>
            <h2 id="deployment-title">One application, PostgreSQL, and Redis</h2>
            <p className="section-heading__description">
              Cloud and self-hosted installations use the same Authlane application boundary. The
              runtime serves the product and control-plane routes, PostgreSQL stores tenant state,
              and Redis supports hot reads, queues, and rate limits.
            </p>
          </div>
          <ol className="deployment-stack" role="list" aria-label="Authlane deployment stack">
            <li>
              <span className="mono">01</span>
              Authlane application
            </li>
            <li>
              <span className="mono">02</span>
              PostgreSQL
            </li>
            <li>
              <span className="mono">03</span>
              Redis
            </li>
          </ol>
        </div>
      </section>

      <section className="closing-action section-shell" aria-labelledby="closing-title">
        <div className="container closing-action__layout">
          <div className="section-heading">
            <p className="mono eyebrow">Build on your boundary</p>
            <h2 id="closing-title">Connect once. Keep execution yours.</h2>
            <p className="section-heading__description">
              Start with the service catalog, then carry one external user identity through hosted
              connect and into locally executing tools.
            </p>
          </div>
          <a className="secondary-action secondary-action--outlined" href={landingLinks.app}>
            Start building
          </a>
        </div>
      </section>
    </>
  );
}

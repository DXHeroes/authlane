/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
export function RequestFlow() {
  return (
    <figure className="request-map" aria-labelledby="request-map-title">
      <figcaption id="request-map-title" className="mono request-map__caption">
        How requests move
      </figcaption>

      <div className="request-map__lanes">
        <section
          className="request-lane request-lane--connect"
          aria-labelledby="connect-once-title"
        >
          <div className="request-lane__heading">
            <span className="mono request-lane__index" aria-hidden="true">
              01
            </span>
            <h3 id="connect-once-title">Connect once</h3>
          </div>
          <ol className="request-route" role="list">
            <li>
              <span className="mono request-node__label">Tenant backend</span>
              <span>Your backend loads services from Authlane.</span>
            </li>
            <li>
              <span className="mono request-node__label">Your product</span>
              <span>Your product renders its integrations UI.</span>
            </li>
            <li>
              <span className="mono request-node__label">Hosted connect</span>
              <span>User user_123 connects through an origin-bound OAuth session.</span>
            </li>
          </ol>
          <p className="request-lane__note">
            Authlane coordinates consent and stores the resulting credential state encrypted.
          </p>
        </section>

        <section className="request-lane request-lane--use" aria-labelledby="use-everywhere-title">
          <div className="request-lane__heading">
            <span className="mono request-lane__index" aria-hidden="true">
              02
            </span>
            <h3 id="use-everywhere-title">Use everywhere</h3>
          </div>
          <ol className="request-route" role="list">
            <li>
              <span className="mono request-node__label">Your runtime</span>
              <span>Your runtime reads user tools and status from Authlane.</span>
            </li>
            <li className="direct-route">
              <span className="mono request-node__label">Provider API</span>
              <span>Your runtime calls the provider directly.</span>
            </li>
          </ol>
          <p className="mono direct-route__label">Authlane is not in this path</p>
        </section>
      </div>
    </figure>
  );
}

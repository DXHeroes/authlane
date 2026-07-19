/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
'use client';

import { useState } from 'react';
import { landingLinks } from '../content';
import {
  getMarketingHomepage,
  getMarketingSectionHref,
  type MarketingNavigationVariant,
  marketingNavigationItems,
} from './marketing-navigation';

type SiteHeaderProps = {
  navigationVariant?: MarketingNavigationVariant;
};

export function SiteHeader({ navigationVariant = 'landing' }: SiteHeaderProps) {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const homepageHref = getMarketingHomepage(navigationVariant);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <a className="wordmark" href={homepageHref} aria-label="Authlane homepage">
          Authlane
        </a>

        <nav className="desktop-navigation" aria-label="Primary navigation">
          <ul className="desktop-navigation__links" role="list">
            {marketingNavigationItems.map((item) => (
              <li key={item.sectionId}>
                <a href={getMarketingSectionHref(item.sectionId, navigationVariant)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header__actions">
          <a href={landingLinks.github}>GitHub</a>
          <a href={landingLinks.signIn}>Sign in</a>
        </div>

        <button
          className="mobile-navigation__toggle"
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={isNavigationOpen}
          aria-label={isNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setIsNavigationOpen((isOpen) => !isOpen)}
        >
          Menu
          <span className="mobile-navigation__touch-target" aria-hidden="true" />
        </button>
      </div>

      <nav
        id="mobile-navigation"
        className="mobile-navigation"
        aria-label="Mobile navigation"
        hidden={!isNavigationOpen}
      >
        <ul className="container mobile-navigation__links" role="list">
          {marketingNavigationItems.map((item) => (
            <li key={item.sectionId}>
              <a
                href={getMarketingSectionHref(item.sectionId, navigationVariant)}
                onClick={() => setIsNavigationOpen(false)}
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <a href={landingLinks.github}>GitHub</a>
          </li>
          <li>
            <a href={landingLinks.signIn}>Sign in</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

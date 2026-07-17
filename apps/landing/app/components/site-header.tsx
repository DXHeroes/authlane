/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { landingLinks } from '../content';

const navigationItems = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'SDKs', href: '#sdks' },
  { label: 'Security', href: '#security' },
  { label: 'Integrations', href: '#integrations' },
] as const;

export function SiteHeader() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="wordmark" href="/" aria-label="Homepage">
          Authlane
        </Link>

        <nav className="desktop-navigation" aria-label="Primary navigation">
          <ul className="desktop-navigation__links" role="list">
            {navigationItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header__actions">
          <Link href={landingLinks.github}>GitHub</Link>
          <Link href={landingLinks.signIn}>Sign in</Link>
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
          {navigationItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={() => setIsNavigationOpen(false)}>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href={landingLinks.github}>GitHub</Link>
          </li>
          <li>
            <Link href={landingLinks.signIn}>Sign in</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

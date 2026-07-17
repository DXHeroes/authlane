/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
import Link from 'next/link';
import { landingLinks } from '../content';
import {
  getMarketingHomepage,
  getMarketingSectionHref,
  type MarketingNavigationVariant,
} from './marketing-navigation';

const footerLinks = [
  { label: 'Product', sectionId: 'product' },
  { label: 'Docs', href: landingLinks.docs },
  { label: 'GitHub', href: landingLinks.github },
  { label: 'Security', sectionId: 'security' },
  { label: 'Self-hosting', href: `${landingLinks.docs}/guides/self-hosting` },
] as const;

type SiteFooterProps = {
  navigationVariant?: MarketingNavigationVariant;
};

export function SiteFooter({ navigationVariant = 'landing' }: SiteFooterProps) {
  const homepageHref = getMarketingHomepage(navigationVariant);

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__identity">
          <Link className="wordmark" href={homepageHref} aria-label="Homepage">
            Authlane
          </Link>
          <p>The control plane for connected tools.</p>
        </div>
        <nav aria-label="Footer navigation">
          <ul className="site-footer__links" role="list">
            {footerLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={
                    'sectionId' in link
                      ? getMarketingSectionHref(link.sectionId, navigationVariant)
                      : link.href
                  }
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

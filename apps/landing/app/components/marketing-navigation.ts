export const marketingHomepage = 'https://authlane.io/' as const;

export const marketingNavigationItems = [
  { label: 'Product', sectionId: 'product' },
  { label: 'How it works', sectionId: 'how-it-works' },
  { label: 'SDKs', sectionId: 'sdks' },
  { label: 'Security', sectionId: 'security' },
  { label: 'Integrations', sectionId: 'integrations' },
] as const;

export type MarketingNavigationVariant = 'landing' | 'absolute';

export function getMarketingHomepage(variant: MarketingNavigationVariant) {
  return variant === 'absolute' ? marketingHomepage : '/';
}

export function getMarketingSectionHref(sectionId: string, variant: MarketingNavigationVariant) {
  return variant === 'absolute' ? `${marketingHomepage}#${sectionId}` : `#${sectionId}`;
}

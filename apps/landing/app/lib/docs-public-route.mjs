export const publicDocsOrigin = 'https://authlane.io';

/** @param {string} slug */
export function getPublicDocPath(slug) {
  return slug === 'introduction' ? '/docs' : `/docs/${slug}`;
}

/** @param {string} slug */
export function getPublicDocUrl(slug) {
  return `${publicDocsOrigin}${getPublicDocPath(slug)}`;
}

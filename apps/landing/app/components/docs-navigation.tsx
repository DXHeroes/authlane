/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: Explicit list roles preserve semantics after the visual reset. */
import Link from 'next/link';
import { getAdjacentDocs, getDocsNavigation } from '../lib/docs';
import { getPublicDocPath } from '../lib/docs-public-route.mjs';

export function DocsNavigation({ currentSlug }: { currentSlug?: string }) {
  const navigation = getDocsNavigation();
  const groups = navigation.map((group) => (
    <section key={group.group} className="docs-nav__group">
      <h2>{group.group}</h2>
      <ul role="list">
        {group.docs.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={getPublicDocPath(doc.slug)}
              aria-current={doc.slug === currentSlug ? 'page' : undefined}
            >
              {doc.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ));

  return (
    <>
      <nav className="docs-nav docs-nav--desktop" aria-label="Documentation navigation">
        {groups}
      </nav>
      <details className="docs-nav-mobile">
        <summary>Browse documentation</summary>
        <nav className="docs-nav" aria-label="Mobile documentation navigation">
          {groups}
        </nav>
      </details>
    </>
  );
}

function getOptionalAdjacentDocs(currentSlug: string) {
  try {
    return getAdjacentDocs(currentSlug);
  } catch (error) {
    if (error instanceof Error && error.message === `Unknown documentation slug: ${currentSlug}`) {
      return { previous: null, next: null };
    }
    throw error;
  }
}

export function PreviousNext({ currentSlug }: { currentSlug: string }) {
  const { previous, next } = getOptionalAdjacentDocs(currentSlug);
  if (!previous && !next) return null;

  return (
    <nav className="docs-pagination" aria-label="Documentation pagination">
      {previous ? (
        <Link
          className="docs-pagination__link docs-pagination__link--previous"
          href={getPublicDocPath(previous.slug)}
        >
          <span className="mono docs-pagination__direction">Previous</span>
          <span>{previous.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {next ? (
        <Link
          className="docs-pagination__link docs-pagination__link--next"
          href={getPublicDocPath(next.slug)}
        >
          <span className="mono docs-pagination__direction">Next</span>
          <span>{next.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

import Link from 'next/link';
import { getDocsNavigation } from '../lib/docs';

export function DocsNavigation({ currentSlug }: { currentSlug?: string }) {
  const navigation = getDocsNavigation();
  const groups = navigation.map((group) => (
    <section key={group.group} className="docs-nav__group">
      <h2>{group.group}</h2>
      <ul>
        {group.docs.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/docs/${doc.slug}`}
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

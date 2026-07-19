import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import type { DocRecord } from '../lib/docs';
import { highlightCode, normalizeLanguage } from '../lib/highlight-code';
import { DocsNavigation } from './docs-navigation';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

type CodeElementProps = {
  className?: string;
  children?: ReactNode;
};

function CodeBlock({ children }: { children?: ReactNode }) {
  if (!isValidElement<CodeElementProps>(children)) {
    return <pre className="docs-code">{children}</pre>;
  }

  const code = String(children.props.children ?? '').replace(/\n$/, '');
  const language = normalizeLanguage(children.props.className);
  return (
    <pre className={`docs-code language-${language}`}>
      <code
        className={`language-${language}`}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism escapes repository-owned MDX during static generation.
        dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
      />
    </pre>
  );
}

function DocsLink({ href = '', children }: { href?: string; children?: ReactNode }) {
  const normalized = href.startsWith('/') && !href.startsWith('/docs') ? `/docs${href}` : href;
  if (normalized.startsWith('http') || normalized.startsWith('mailto:')) {
    return <a href={normalized}>{children}</a>;
  }
  return <Link href={normalized}>{children}</Link>;
}

function Warning({ children }: { children?: ReactNode }) {
  return (
    <aside className="docs-callout docs-callout--warning" aria-label="Warning">
      <strong>Warning</strong>
      <div>{children}</div>
    </aside>
  );
}

const mdxComponents = {
  a: DocsLink,
  pre: CodeBlock,
  Warning,
};

function Breadcrumbs({ doc }: { doc: DocRecord }) {
  const segments = doc.slug.split('/');
  return (
    <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link href="/docs">Docs</Link>
        </li>
        {segments.map((segment, index) => {
          const current = index === segments.length - 1;
          const href = `/docs/${segments.slice(0, index + 1).join('/')}`;
          return (
            <li key={href} aria-current={current ? 'page' : undefined}>
              {current ? doc.title : segment.replaceAll('-', ' ')}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function DocsPage({ doc, children }: { doc: DocRecord; children?: ReactNode }) {
  return (
    <div className="site-shell docs-site-shell antialiased">
      <a className="skip-link" href="#docs-content">
        Skip to documentation
      </a>
      <SiteHeader navigationVariant="absolute" />
      <main className="docs-layout container">
        <DocsNavigation currentSlug={doc.slug} />
        <article id="docs-content" className="docs-article">
          <Breadcrumbs doc={doc} />
          <header className="docs-article__header">
            <p className="mono eyebrow">Documentation</p>
            <h1>{doc.title}</h1>
            {doc.description ? <p>{doc.description}</p> : null}
          </header>
          <div className="docs-prose">{children}</div>
        </article>
        <aside className="docs-toc" aria-label="On this page">
          <h2>On this page</h2>
          {doc.headings.length ? (
            <ol>
              {doc.headings.map((heading) => (
                <li key={`${heading.depth}-${heading.id}`} data-depth={heading.depth}>
                  <a href={`#${heading.id}`}>{heading.text}</a>
                </li>
              ))}
            </ol>
          ) : (
            <p>No sections</p>
          )}
        </aside>
      </main>
      <SiteFooter navigationVariant="absolute" />
    </div>
  );
}

export async function DocsMdx({ doc }: { doc: DocRecord }): Promise<ReactElement> {
  return (
    <MDXRemote
      source={doc.source}
      components={mdxComponents}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]],
        },
      }}
    />
  );
}

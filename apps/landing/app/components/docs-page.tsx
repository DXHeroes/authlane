/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: Explicit list roles preserve semantics after the visual reset. */
import { compileMDX } from 'next-mdx-remote/rsc';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { landingLinks } from '../content';
import type { DocRecord } from '../lib/docs';
import { normalizeLanguage } from '../lib/highlight-code';
import { CodeGroup, CodeGroupItem, DocsCodeBlock } from './docs-code';
import { DocsNavigation, PreviousNext } from './docs-navigation';
import { DocsSearch } from './docs-search';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

type CodeElementProps = {
  className?: string;
  children?: ReactNode;
};

function CodeBlockFromMdx({ children }: { children?: ReactNode }) {
  if (!isValidElement<CodeElementProps>(children)) {
    return <DocsCodeBlock language="text" source={String(children ?? '')} />;
  }

  const source = String(children.props.children ?? '').replace(/\n$/, '');
  const language = normalizeLanguage(children.props.className);
  return <DocsCodeBlock language={language} source={source} />;
}

function DocsLink({ href = '', children }: { href?: string; children?: ReactNode }) {
  const normalized = href.startsWith('/') && !href.startsWith('/docs') ? `/docs${href}` : href;
  if (normalized.startsWith('http') || normalized.startsWith('mailto:')) {
    return <a href={normalized}>{children}</a>;
  }
  return <a href={normalized}>{children}</a>;
}

type CalloutTone = 'note' | 'warning' | 'security' | 'performance';

export type CalloutProps = {
  children?: ReactNode;
  tone?: CalloutTone;
};

const calloutLabels: Record<CalloutTone, string> = {
  note: 'Note',
  warning: 'Warning',
  security: 'Security',
  performance: 'Performance',
};

export function Callout({ children, tone = 'note' }: CalloutProps) {
  const label = calloutLabels[tone];
  return (
    <aside className={`docs-callout docs-callout--${tone}`} aria-label={label}>
      <strong>{label}</strong>
      <div>{children}</div>
    </aside>
  );
}

export function Steps({ children }: { children?: ReactNode }) {
  return (
    <ol className="docs-prose-steps" role="list">
      {children}
    </ol>
  );
}

export function PageActions({ doc }: { doc: DocRecord }) {
  const sourcePath =
    doc.slug === 'api-reference'
      ? 'apps/docs/api-reference/openapi.yaml'
      : `apps/docs/${doc.slug}.mdx`;
  return (
    <nav className="docs-page-actions" aria-label="Page actions">
      <a href={`/docs/markdown/${doc.slug}.md`}>Open Markdown</a>
      <a href={`${landingLinks.github}/blob/main/${sourcePath}`}>View source</a>
    </nav>
  );
}

const mdxComponents = {
  a: DocsLink,
  pre: CodeBlockFromMdx,
  Warning: (props: CalloutProps) => <Callout tone="warning" {...props} />,
  Security: (props: CalloutProps) => <Callout tone="security" {...props} />,
  Performance: (props: CalloutProps) => <Callout tone="performance" {...props} />,
  Steps,
  CodeGroup,
  CodeGroupItem,
};

function Breadcrumbs({ doc }: { doc: DocRecord }) {
  const segments = doc.slug.split('/');
  return (
    <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
      <ol role="list">
        <li>
          <a href="/docs">Docs</a>
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
    <div className="site-shell docs-site-shell antialiased isolate">
      <a className="skip-link" href="#docs-content">
        Skip to documentation
      </a>
      <SiteHeader navigationVariant="absolute" />
      <main className="docs-layout container">
        <DocsSearch />
        <DocsNavigation currentSlug={doc.slug} />
        <article id="docs-content" className="docs-article">
          <Breadcrumbs doc={doc} />
          <header className="docs-article__header">
            <p className="mono eyebrow docs-article__eyebrow">Documentation</p>
            <h1>{doc.title}</h1>
            {doc.description ? <p>{doc.description}</p> : null}
          </header>
          <div className="docs-prose">{children}</div>
          {doc.source ? <PageActions doc={doc} /> : null}
          <PreviousNext currentSlug={doc.slug} />
        </article>
        <aside className="docs-toc" aria-label="On this page">
          <h2>On this page</h2>
          {doc.headings.length ? (
            <ol role="list">
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

export async function renderDocsMdxSource(source: string): Promise<ReactElement> {
  const { content } = await compileMDX({
    source,
    components: mdxComponents,
    options: {
      blockJS: true,
      blockDangerousJS: true,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]],
      },
    },
  });
  return content;
}

export async function DocsMdx({ doc }: { doc: DocRecord }): Promise<ReactElement> {
  return renderDocsMdxSource(doc.source);
}

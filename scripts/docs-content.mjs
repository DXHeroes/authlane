import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, posix, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';

const docsBaseUrl = 'https://authlane.io/docs';

export const knownCodeLanguages = new Set([
  'bash',
  'css',
  'http',
  'javascript',
  'json',
  'jsx',
  'python',
  'text',
  'tsx',
  'typescript',
  'yaml',
]);

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function parseFrontmatter(source) {
  const normalized = normalizeLineEndings(source);
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!frontmatter) return { attributes: {}, body: normalized, hasFrontmatter: false };

  const parsed = YAML.parse(frontmatter[1]);
  return {
    attributes: parsed && typeof parsed === 'object' ? parsed : {},
    body: normalized.slice(frontmatter[0].length),
    hasFrontmatter: true,
  };
}

function headingId(value) {
  return value
    .toLowerCase()
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractHeadings(source) {
  const headings = [];
  let fenced = false;

  for (const line of source.split('\n')) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const match = /^(##|###)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const text = match[2].replace(/\[([^\]]+)]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');
    headings.push({
      depth: match[1].length,
      id: headingId(text),
      text,
    });
  }

  return headings;
}

function isFence(line) {
  return /^\s*```/.test(line);
}

const calloutNames = new Set(['Check', 'Caution', 'Danger', 'Info', 'Note', 'Tip', 'Warning']);

function canonicalDocumentationHref(href, documentSlugs) {
  if (
    !href.startsWith('/') ||
    href === '/docs' ||
    href.startsWith('/docs/') ||
    href.startsWith('/docs#')
  ) {
    return href;
  }

  const suffixIndex = href.search(/[?#]/);
  const path = suffixIndex >= 0 ? href.slice(0, suffixIndex) : href;
  const suffix = suffixIndex >= 0 ? href.slice(suffixIndex) : '';
  const slug = path.replace(/^\//, '').replace(/\/$/, '');
  if (!documentSlugs.has(slug)) return href;

  const canonicalPath = slug === 'introduction' ? '/docs' : `/docs/${slug}`;
  return `${canonicalPath}${suffix}`;
}

function rewriteDocumentationLinks(line, documentSlugs) {
  return line
    .replace(/(\[[^\]]*]\()([^)\s]+)(\))/g, (_match, opening, href, closing) => {
      return `${opening}${canonicalDocumentationHref(href, documentSlugs)}${closing}`;
    })
    .replace(/(\bhref=["'])([^"']+)(["'])/g, (_match, opening, href, closing) => {
      return `${opening}${canonicalDocumentationHref(href, documentSlugs)}${closing}`;
    });
}

function toPublicMarkdownBody(source, documentSlugs) {
  const output = [];
  let fenced = false;
  let callout = null;

  for (const line of source.split('\n')) {
    if (isFence(line)) {
      fenced = !fenced;
      output.push(line);
      continue;
    }

    if (fenced) {
      output.push(line);
      continue;
    }

    const calloutOpen = /^\s*<([A-Z][A-Za-z0-9]*)>\s*$/.exec(line);
    if (calloutOpen && calloutNames.has(calloutOpen[1])) {
      callout = calloutOpen[1];
      output.push(`> **${callout}**`);
      continue;
    }
    if (callout && new RegExp(`^\\s*</${callout}>\\s*$`).test(line)) {
      callout = null;
      continue;
    }
    if (callout) {
      output.push(line.trim() ? `> ${rewriteDocumentationLinks(line.trim(), documentSlugs)}` : '>');
      continue;
    }

    const withoutComponents = line.replace(/<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/g, '');
    if (withoutComponents.trim() || !line.trim()) {
      output.push(rewriteDocumentationLinks(withoutComponents, documentSlugs));
    }
  }

  return output.join('\n').trim();
}

function documentUrl(slug) {
  return slug === 'introduction' ? docsBaseUrl : `${docsBaseUrl}/${slug}`;
}

function renderPublicMarkdown(document, documentSlugs) {
  const body = toPublicMarkdownBody(document.source, documentSlugs);
  return [
    `# ${document.title}`,
    '',
    document.description,
    ...(document.api ? ['', `**Endpoint:** \`${document.api}\``] : []),
    ...(body ? ['', body] : []),
    '',
  ].join('\n');
}

function markdownToText(markdown) {
  return markdown
    .replace(/^```[^\n]*$/gm, '')
    .replace(/^```$/gm, '')
    .replace(/!\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>|[-*+] |\d+\. )\s*/gm, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchKeywords(...values) {
  const matches = values
    .filter((value) => value !== null)
    .join(' ')
    .match(/<[^>\s]+>|[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)+|[A-Za-z][A-Za-z0-9]*/g);
  return [...new Set(matches ?? [])].sort((left, right) => left.localeCompare(right));
}

function searchSections(markdown) {
  const sections = [];
  let current = null;
  let fenced = false;

  for (const line of markdown.split('\n')) {
    if (isFence(line)) {
      fenced = !fenced;
      if (current) current.lines.push(line);
      continue;
    }

    const match = fenced ? null : /^(##|###)\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      const heading = match[2].replace(/\[([^\]]+)]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');
      current = { headingId: headingId(heading), heading, lines: [] };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) sections.push(current);
  return sections.map((section) => ({
    headingId: section.headingId,
    heading: section.heading,
    text: markdownToText(section.lines.join('\n')),
  }));
}

function documentFromSource(document, navigationGroup, order, documentSlugs) {
  const { attributes, body } = parseFrontmatter(document.source);
  const parsed = {
    slug: document.slug,
    title: String(attributes.title ?? 'Authlane documentation'),
    description: String(attributes.description ?? ''),
    ...(typeof attributes.api === 'string' ? { api: attributes.api } : {}),
    source: body,
    headings: extractHeadings(body),
    navigationGroup,
    order,
    url: documentUrl(document.slug),
  };

  return { ...parsed, publicMarkdown: renderPublicMarkdown(parsed, documentSlugs) };
}

export function buildDocumentationModel({ navigation, documents }) {
  const documentsBySlug = new Map(documents.map((document) => [document.slug, document]));
  const documentSlugs = new Set(documentsBySlug.keys());
  const orderedDocuments = [];
  let order = 0;

  for (const group of navigation) {
    for (const slug of group.pages) {
      const document = documentsBySlug.get(slug);
      if (!document || orderedDocuments.some((candidate) => candidate.slug === slug)) continue;
      orderedDocuments.push(documentFromSource(document, group.group, order, documentSlugs));
      order += 1;
    }
  }

  const normalizedNavigation = navigation.map((group) => ({
    group: group.group,
    pages: [...group.pages],
  }));
  const searchEntries = orderedDocuments.flatMap((document) => {
    const pageText = markdownToText(document.publicMarkdown);
    const pageEntry = {
      slug: document.slug,
      title: document.title,
      description: document.description,
      headingId: null,
      heading: null,
      text: pageText,
      keywords: searchKeywords(document.title, document.description, pageText),
    };
    const headingEntries = searchSections(document.publicMarkdown).map((section) => ({
      slug: document.slug,
      title: document.title,
      description: document.description,
      headingId: section.headingId,
      heading: section.heading,
      text: section.text,
      keywords: searchKeywords(document.title, document.description, section.heading, section.text),
    }));
    return [pageEntry, ...headingEntries];
  });
  const llms = [
    '# Authlane documentation',
    '',
    '> Authlane is the connection and tool control plane for SaaS applications.',
    '',
    '## Documentation',
    '',
    ...orderedDocuments.map(
      (document) => `- [${document.title}](${document.url}): ${document.description}`
    ),
    '',
  ].join('\n');
  const llmsFull = [
    '# Authlane documentation',
    '',
    ...orderedDocuments.flatMap((document) => [
      `Source: ${document.url}`,
      '',
      document.publicMarkdown.trimEnd(),
      '',
    ]),
  ].join('\n');

  return {
    documents: orderedDocuments,
    navigation: normalizedNavigation,
    searchEntries,
    llms,
    llmsFull,
  };
}

function unfencedSource(source) {
  const output = [];
  let fenced = false;
  for (const line of normalizeLineEndings(source).split('\n')) {
    if (isFence(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) output.push(line);
  }
  return output.join('\n');
}

function extractCodeFenceLanguages(source) {
  const languages = [];
  let fenced = false;
  for (const line of normalizeLineEndings(source).split('\n')) {
    const match = /^\s*```([^\s`]*)\s*$/.exec(line);
    if (!match) continue;
    if (!fenced) languages.push(match[1]);
    fenced = !fenced;
  }
  return languages;
}

function extractInternalLinks(source) {
  const links = [];
  const markdown = unfencedSource(source);
  for (const match of markdown.matchAll(/(?<!!)\[[^\]]*]\(([^)\s]+)(?:\s+['"][^)]*)?\)/g)) {
    links.push(match[1]);
  }
  for (const match of markdown.matchAll(/\bhref=["']([^"']+)["']/g)) links.push(match[1]);
  return links;
}

function resolveInternalLink(sourceSlug, href) {
  let value = href;
  if (value.startsWith(`${docsBaseUrl}/`)) value = value.slice(docsBaseUrl.length);
  else if (value === docsBaseUrl) value = '/docs';
  else if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return null;

  const hashIndex = value.indexOf('#');
  const path = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  let fragment = '';
  if (hashIndex >= 0) {
    try {
      fragment = decodeURIComponent(value.slice(hashIndex + 1));
    } catch {
      return { error: 'malformed internal fragment encoding' };
    }
  }
  let slug;

  if (!path) slug = sourceSlug;
  else if (path === '/docs' || path === '/') slug = 'introduction';
  else if (path.startsWith('/docs/')) slug = path.slice('/docs/'.length);
  else if (path.startsWith('/')) slug = path.slice(1);
  else slug = posix.normalize(posix.join(posix.dirname(sourceSlug), path));

  slug = slug
    .replace(/\.mdx?$/, '')
    .replace(/^\.\//, '')
    .replace(/\/$/, '');
  return { slug, fragment };
}

function validationMessage(slug, rule, detail) {
  return `${slug}: ${rule}: ${detail}`;
}

export function validateDocumentation({ navigation, documents }) {
  const violations = [];
  const navigationSlugs = new Set();
  const documentsBySlug = new Map();
  const parsedDocuments = new Map();

  for (const group of navigation) {
    for (const slug of group.pages) {
      if (navigationSlugs.has(slug)) {
        violations.push(validationMessage(slug, 'duplicate navigation slug', slug));
      }
      navigationSlugs.add(slug);
    }
  }

  for (const document of documents) {
    if (documentsBySlug.has(document.slug)) {
      violations.push(validationMessage(document.slug, 'duplicate document slug', document.slug));
      continue;
    }
    documentsBySlug.set(document.slug, document);

    try {
      parsedDocuments.set(document.slug, parseFrontmatter(document.source));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      violations.push(validationMessage(document.slug, 'invalid frontmatter', detail));
    }
  }

  for (const slug of navigationSlugs) {
    if (!documentsBySlug.has(slug)) {
      violations.push(validationMessage(slug, 'missing MDX', 'listed in navigation'));
    }
  }

  for (const document of documentsBySlug.values()) {
    const { slug, source } = document;
    if (!navigationSlugs.has(slug)) {
      violations.push(validationMessage(slug, 'orphan MDX', 'not listed in navigation'));
    }

    const parsed = parsedDocuments.get(slug);
    if (!parsed) continue;
    if (
      !parsed.hasFrontmatter ||
      typeof parsed.attributes.title !== 'string' ||
      !parsed.attributes.title.trim()
    ) {
      violations.push(validationMessage(slug, 'missing frontmatter title', slug));
    }
    if (
      !parsed.hasFrontmatter ||
      typeof parsed.attributes.description !== 'string' ||
      !parsed.attributes.description.trim()
    ) {
      violations.push(validationMessage(slug, 'missing frontmatter description', slug));
    }

    for (const language of extractCodeFenceLanguages(source)) {
      if (!knownCodeLanguages.has(language)) {
        violations.push(validationMessage(slug, `unknown code fence language "${language}"`, slug));
      }
    }

    const authoringSource = unfencedSource(parsed.body);
    const marker =
      /\b(?:TODO|TBD|FIXME|XXX|WIP)\b|\bcoming soon\b|\blorem ipsum\b|\{\{[^}]+\}\}/i.exec(
        authoringSource
      );
    if (marker) {
      violations.push(validationMessage(slug, 'unfinished authoring marker', marker[0]));
    }
  }

  const headingsBySlug = new Map(
    [...parsedDocuments].map(([slug, parsed]) => [
      slug,
      new Set(extractHeadings(parsed.body).map((heading) => heading.id)),
    ])
  );

  for (const document of documentsBySlug.values()) {
    for (const href of extractInternalLinks(document.source)) {
      const target = resolveInternalLink(document.slug, href);
      if (!target) continue;
      if (target.error) {
        violations.push(validationMessage(document.slug, target.error, href));
        continue;
      }
      if (!documentsBySlug.has(target.slug)) {
        violations.push(validationMessage(document.slug, 'broken internal page link', href));
        continue;
      }
      if (target.fragment && !headingsBySlug.get(target.slug)?.has(target.fragment)) {
        violations.push(validationMessage(document.slug, 'broken internal fragment link', href));
      }
    }
  }

  return violations.sort((left, right) => left.localeCompare(right));
}

function docsRootFrom(root) {
  const candidate = resolve(root);
  try {
    readFileSync(join(candidate, 'mint.json'));
    return candidate;
  } catch {
    return join(candidate, 'apps', 'docs');
  }
}

function collectMdxFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMdxFiles(path));
    else if (entry.isFile() && extname(entry.name) === '.mdx') files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function loadDocumentation(root) {
  const docsRoot = docsRootFrom(root);
  const mint = JSON.parse(readFileSync(join(docsRoot, 'mint.json'), 'utf8'));
  const documents = collectMdxFiles(docsRoot).map((path) => ({
    slug: relative(docsRoot, path)
      .split(sep)
      .join('/')
      .replace(/\.mdx$/, ''),
    source: readFileSync(path, 'utf8'),
  }));

  return { navigation: mint.navigation, documents };
}

export function renderGeneratedAssets(model) {
  return {
    manifest: `${JSON.stringify(
      { documents: model.documents, navigation: model.navigation },
      null,
      2
    )}\n`,
    searchIndex: `${JSON.stringify(model.searchEntries, null, 2)}\n`,
    markdown: new Map(model.documents.map((document) => [document.slug, document.publicMarkdown])),
    llms: model.llms,
    llmsFull: model.llmsFull,
  };
}

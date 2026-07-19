import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

type MintNavigationGroup = {
  group: string;
  pages: string[];
};

type MintConfig = {
  navigation: MintNavigationGroup[];
};

export type DocHeading = {
  depth: 2 | 3;
  id: string;
  text: string;
};

export type DocRecord = {
  slug: string;
  title: string;
  description: string;
  source: string;
  headings: DocHeading[];
  navigationGroup: string;
};

export type DocsNavigationGroup = {
  group: string;
  pages: string[];
  docs: DocRecord[];
};

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs');
const mint = JSON.parse(readFileSync(resolve(docsRoot, 'mint.json'), 'utf8')) as MintConfig;

function headingId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function parseSource(
  source: string
): Pick<DocRecord, 'title' | 'description' | 'source' | 'headings'> {
  const frontmatter = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  const attributes = frontmatter ? (YAML.parse(frontmatter[1]) as Record<string, unknown>) : {};
  const body = frontmatter ? source.slice(frontmatter[0].length) : source;
  const headings: DocHeading[] = [];
  let fenced = false;

  for (const line of body.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(##|###)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/\[([^\]]+)]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');
    headings.push({ depth: match[1].length as 2 | 3, id: headingId(text), text });
  }

  return {
    title: String(attributes.title ?? 'Authlane documentation'),
    description: String(attributes.description ?? ''),
    source: body,
    headings,
  };
}

function materializeDoc(slug: string, navigationGroup: string): DocRecord {
  const source = readFileSync(resolve(docsRoot, `${slug}.mdx`), 'utf8');
  return { slug, ...parseSource(source), navigationGroup };
}

export function getDocsNavigation(): DocsNavigationGroup[] {
  return mint.navigation.map((group) => ({
    ...group,
    docs: group.pages.map((slug) => materializeDoc(slug, group.group)),
  }));
}

export function getAllDocs(): DocRecord[] {
  return getDocsNavigation().flatMap((group) => group.docs);
}

export function getDoc(slug: string): DocRecord {
  const normalized = slug.replace(/^\/+|\/+$/g, '');
  const group = mint.navigation.find((candidate) => candidate.pages.includes(normalized));
  if (!group) throw new Error(`Unknown documentation slug: ${normalized}`);
  return materializeDoc(normalized, group.group);
}

export function getAdjacentDocs(slug: string): {
  previous: DocRecord | null;
  next: DocRecord | null;
} {
  const docs = getAllDocs();
  const index = docs.findIndex((doc) => doc.slug === slug);
  if (index < 0) throw new Error(`Unknown documentation slug: ${slug}`);
  return { previous: docs[index - 1] ?? null, next: docs[index + 1] ?? null };
}

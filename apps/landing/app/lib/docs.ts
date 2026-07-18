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

export function getDocsNavigation(): Array<MintNavigationGroup & { docs: DocRecord[] }> {
  return mint.navigation.map((group) => ({
    ...group,
    docs: group.pages.map(getDoc),
  }));
}

export function getAllDocs(): DocRecord[] {
  return mint.navigation.flatMap((group) => group.pages.map(getDoc));
}

export function getDoc(slug: string): DocRecord {
  const normalized = slug.replace(/^\/+|\/+$/g, '');
  const known = mint.navigation.some((group) => group.pages.includes(normalized));
  if (!known) throw new Error(`Unknown documentation slug: ${normalized}`);
  const source = readFileSync(resolve(docsRoot, `${normalized}.mdx`), 'utf8');
  return { slug: normalized, ...parseSource(source) };
}

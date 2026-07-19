import generatedManifest from '../generated/docs-manifest.json';

type MintNavigationGroup = {
  group: string;
  pages: string[];
};

type DocsManifest = {
  documents: DocRecord[];
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
  api?: string;
  source: string;
  headings: DocHeading[];
  navigationGroup: string;
};

export type DocsNavigationGroup = {
  group: string;
  pages: string[];
  docs: DocRecord[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHeading(value: unknown, documentSlug: string): DocHeading {
  if (
    !isObject(value) ||
    (value.depth !== 2 && value.depth !== 3) ||
    typeof value.id !== 'string' ||
    typeof value.text !== 'string'
  ) {
    throw new Error(`Invalid documentation heading in generated manifest: ${documentSlug}`);
  }
  return { depth: value.depth, id: value.id, text: value.text };
}

function parseDocument(value: unknown): DocRecord {
  if (
    !isObject(value) ||
    typeof value.slug !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    (value.api !== undefined && typeof value.api !== 'string') ||
    typeof value.source !== 'string' ||
    !Array.isArray(value.headings) ||
    typeof value.navigationGroup !== 'string'
  ) {
    throw new Error(
      'Invalid documentation record in generated manifest. Run `pnpm docs:generate`.'
    );
  }
  const slug = value.slug;

  return {
    slug,
    title: value.title,
    description: value.description,
    ...(value.api !== undefined ? { api: value.api } : {}),
    source: value.source,
    headings: value.headings.map((heading) => parseHeading(heading, slug)),
    navigationGroup: value.navigationGroup,
  };
}

function parseNavigationGroup(value: unknown): MintNavigationGroup {
  if (
    !isObject(value) ||
    typeof value.group !== 'string' ||
    !Array.isArray(value.pages) ||
    !value.pages.every((page) => typeof page === 'string')
  ) {
    throw new Error(
      'Invalid documentation navigation in generated manifest. Run `pnpm docs:generate`.'
    );
  }
  return { group: value.group, pages: value.pages };
}

function parseManifest(value: unknown): DocsManifest {
  if (!isObject(value) || !Array.isArray(value.documents) || !Array.isArray(value.navigation)) {
    throw new Error('Invalid generated documentation manifest. Run `pnpm docs:generate`.');
  }

  const documents = value.documents.map(parseDocument);
  const navigation = value.navigation.map(parseNavigationGroup);
  const documentsBySlug = new Map(documents.map((document) => [document.slug, document]));
  const navigationSlugs = navigation.flatMap((group) => group.pages);

  if (
    documentsBySlug.size !== documents.length ||
    new Set(navigationSlugs).size !== navigationSlugs.length ||
    navigationSlugs.length !== documents.length ||
    navigation.some((group) =>
      group.pages.some((slug) => documentsBySlug.get(slug)?.navigationGroup !== group.group)
    )
  ) {
    throw new Error('Inconsistent generated documentation manifest. Run `pnpm docs:generate`.');
  }

  return { documents, navigation };
}

const manifest = parseManifest(generatedManifest);
const documentsBySlug = new Map(manifest.documents.map((document) => [document.slug, document]));

export function getDocsNavigation(): DocsNavigationGroup[] {
  return manifest.navigation.map((group) => ({
    ...group,
    docs: group.pages.map((slug) => {
      const document = documentsBySlug.get(slug);
      if (!document) throw new Error(`Unknown documentation slug: ${slug}`);
      return document;
    }),
  }));
}

export function getAllDocs(): DocRecord[] {
  return [...manifest.documents];
}

export function getDoc(slug: string): DocRecord {
  const normalized = slug.replace(/^\/+|\/+$/g, '');
  const document = documentsBySlug.get(normalized);
  if (!document) throw new Error(`Unknown documentation slug: ${normalized}`);
  return document;
}

export function getAdjacentDocs(slug: string): {
  previous: DocRecord | null;
  next: DocRecord | null;
} {
  const index = manifest.documents.findIndex((document) => document.slug === slug);
  if (index < 0) throw new Error(`Unknown documentation slug: ${slug}`);
  return {
    previous: manifest.documents[index - 1] ?? null,
    next: manifest.documents[index + 1] ?? null,
  };
}

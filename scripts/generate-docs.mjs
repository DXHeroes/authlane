import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDocumentationModel,
  loadDocumentation,
  loadIntegrationConfigs,
  renderGeneratedAssets,
  renderIntegrationPackageReadmes,
  validateRepositoryDocumentation,
} from './docs-content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const markdownRoot = resolve(root, 'apps/landing/public/docs/markdown');

const documentation = loadDocumentation(root);
const violations = validateRepositoryDocumentation(root);
if (violations.length > 0) {
  throw new Error(
    `Documentation validation failed:\n${violations.map((value) => `- ${value}`).join('\n')}`
  );
}

const assets = renderGeneratedAssets(buildDocumentationModel(documentation));
const integrationReadmes = renderIntegrationPackageReadmes(loadIntegrationConfigs(root));
const expectedFiles = [
  {
    path: resolve(root, 'apps/landing/app/generated/docs-manifest.json'),
    contents: assets.manifest,
  },
  {
    path: resolve(root, 'apps/landing/public/docs/search-index.json'),
    contents: assets.searchIndex,
  },
  ...[...assets.markdown]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slug, contents]) => ({ path: resolve(markdownRoot, `${slug}.md`), contents })),
  { path: resolve(root, 'apps/landing/public/llms.txt'), contents: assets.llms },
  { path: resolve(root, 'apps/landing/public/llms-full.txt'), contents: assets.llmsFull },
  ...[...integrationReadmes].map(([serviceId, contents]) => ({
    path: resolve(root, 'integrations', serviceId, 'README.md'),
    contents,
  })),
].sort((left, right) => left.path.localeCompare(right.path));

async function collectMarkdownFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMarkdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function currentContents(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

const expectedMarkdownPaths = new Set(
  expectedFiles
    .filter(({ path }) => path.startsWith(`${markdownRoot}${sep}`))
    .map(({ path }) => path)
);
const staleMarkdownFiles = (await collectMarkdownFiles(markdownRoot)).filter(
  (path) => !expectedMarkdownPaths.has(path)
);

if (check) {
  const staleFiles = [];
  for (const file of expectedFiles) {
    if ((await currentContents(file.path)) !== file.contents) staleFiles.push(file.path);
  }
  staleFiles.push(...staleMarkdownFiles);

  if (staleFiles.length > 0) {
    throw new Error(
      `Documentation assets are stale:\n${staleFiles
        .sort((left, right) => left.localeCompare(right))
        .map((path) => `- ${relative(root, path)}`)
        .join('\n')}\nRun \`pnpm docs:generate\`.`
    );
  }
} else {
  for (const path of staleMarkdownFiles) await rm(path);
  for (const file of expectedFiles) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents);
  }
}

console.log(
  check
    ? 'Documentation assets are current.'
    : `Generated ${expectedFiles.length} documentation assets.`
);

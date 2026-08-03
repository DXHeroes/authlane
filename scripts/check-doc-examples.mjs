#!/usr/bin/env node
/**
 * Checks every code example in the documentation.
 *
 * The docs promise working code, and nothing verified that promise: the examples were prose. This
 * extracts each fenced typescript/tsx block into a real module and compiles the lot against the
 * SDK's own sources, so an example that would not compile fails the build. Python blocks go
 * through ruff, which catches the same class of mistake: a syntax error, an undefined name, an
 * import that does not exist.
 *
 * Three conveniences keep the examples readable rather than repetitive:
 *
 *  - A block that uses `authlane` without constructing it gets the standard setup prepended. Pages
 *    show that setup once, at the top, and later blocks continue from it.
 *  - An import of a `./local.js` module resolves to a stub exporting exactly the names the block
 *    asks for. Those modules stand for the reader's own code, which the docs cannot supply.
 *  - Framework packages are symlinked in from the workspace package that depends on them, so an
 *    example may import `ai` or `react` even though the repository root does not.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const docsRoot = join(repositoryRoot, 'apps/docs');
const outputRoot = join(repositoryRoot, '.tmp/doc-examples');
const moduleRoot = join(outputRoot, 'node_modules');
const pythonRoot = join(repositoryRoot, '.tmp/doc-examples-python');

/** Where a framework package may live, in priority order. pnpm does not hoist to the root. */
const DEPENDENCY_SOURCES = [
  join(repositoryRoot, 'packages/ai/node_modules'),
  join(repositoryRoot, 'packages/react/node_modules'),
  join(repositoryRoot, 'node_modules'),
];

/** Setup a block may lean on instead of repeating it. Mirrors what every page shows first. */
const SETUP = [
  "import { Authlane } from '@authlane/sdk';",
  '',
  'const authlane = new Authlane({',
  '  apiKey: process.env.AUTHLANE_API_KEY!,',
  '});',
  '',
].join('\n');

function collectMdxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectMdxFiles(path);
    return entry.isFile() && extname(entry.name) === '.mdx' ? [path] : [];
  });
}

function extractBlocks(source) {
  const blocks = [];
  const pattern = /^```(typescript|ts|tsx|python)\n([\s\S]*?)^```/gm;
  let match = pattern.exec(source);
  while (match) {
    blocks.push({ language: match[1], code: match[2] });
    match = pattern.exec(source);
  }
  return blocks;
}

/** Every module specifier the code imports, with the named and default bindings it takes. */
function importedModules(code) {
  const modules = new Map();
  const pattern = /import\s+([\s\S]*?)\s+from\s+'([^']+)'/g;
  let match = pattern.exec(code);
  while (match) {
    const [, clause, specifier] = match;
    const entry = modules.get(specifier) ?? { named: new Set(), default: false };
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const name = part
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name) entry.named.add(name);
      }
    }
    if (/^[A-Za-z_$][\w$]*\s*(?:,|$)/.test(clause.trim())) entry.default = true;
    modules.set(specifier, entry);
    match = pattern.exec(code);
  }
  return modules;
}

/**
 * A module the reader writes themselves.
 *
 * Every binding is `any` on purpose: the documentation makes no claim about the shape of the
 * reader's own helpers, only about the Authlane calls around them.
 */
function stubModule(bindings) {
  const lines = ["// Stub for the reader's own module. See scripts/check-doc-examples.mjs."];
  for (const name of [...bindings.named].sort()) {
    lines.push(`export declare const ${name}: any;`);
  }
  if (bindings.default) lines.push('declare const fallback: any;', 'export default fallback;');
  if (bindings.named.size === 0 && !bindings.default) lines.push('export {};');
  return `${lines.join('\n')}\n`;
}

function linkDependency(specifier) {
  const packageName = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  const target = join(moduleRoot, packageName);
  if (existsSync(target)) return;

  const source = DEPENDENCY_SOURCES.map((root) => join(root, packageName)).find((path) =>
    existsSync(path)
  );
  if (!source) return;

  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, 'dir');
}

function checkPython() {
  const result = spawnSync(
    'uv',
    [
      'run',
      '--project',
      'packages/python',
      '--frozen',
      'ruff',
      'check',
      // F821 is the one that matters here: a name the example never defines.
      '--select',
      'E9,F',
      relative(repositoryRoot, pythonRoot),
    ],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );

  if (result.error?.code === 'ENOENT') {
    console.warn('Skipped the Python examples: uv is not installed.');
    return true;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function main() {
  rmSync(outputRoot, { recursive: true, force: true });
  rmSync(pythonRoot, { recursive: true, force: true });
  mkdirSync(moduleRoot, { recursive: true });
  mkdirSync(pythonRoot, { recursive: true });

  let count = 0;
  for (const file of collectMdxFiles(docsRoot).sort()) {
    const source = readFileSync(file, 'utf8');
    const slug = relative(docsRoot, file)
      .replace(/\.mdx$/, '')
      .replaceAll('/', '__');

    extractBlocks(source).forEach((block, index) => {
      if (block.language === 'python') {
        writeFileSync(join(pythonRoot, `${slug}__${index}.py`), block.code);
        count += 1;
        return;
      }

      const needsSetup = /\bauthlane\b/.test(block.code) && !block.code.includes('new Authlane(');
      const code = needsSetup ? `${SETUP}${block.code}` : block.code;
      const extension = block.language === 'tsx' ? 'tsx' : 'ts';
      // A JSX block never imports React by name, but the compiler still needs its runtime types.
      if (extension === 'tsx') {
        linkDependency('react');
        linkDependency('@types/react');
      }

      for (const [specifier, bindings] of importedModules(code)) {
        if (specifier.startsWith('.')) {
          const stubPath = join(outputRoot, `${specifier.replace(/\.js$/, '')}.d.ts`);
          mkdirSync(dirname(stubPath), { recursive: true });
          writeFileSync(stubPath, stubModule(bindings));
        } else if (!specifier.startsWith('@authlane/') && !specifier.startsWith('node:')) {
          linkDependency(specifier);
        }
      }

      // The file name carries the page, so a compiler error points back at its source.
      writeFileSync(join(outputRoot, `${slug}__${index}.${extension}`), `${code}\n`);
      count += 1;
    });
  }

  const result = spawnSync(
    'node',
    [join(repositoryRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.doc-examples.json'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const pythonOk = checkPython();

  if (result.status !== 0 || !pythonOk) {
    console.error(`\nDocumentation examples do not check out. Inspected ${count} blocks.`);
    process.exit(1);
  }

  console.log(`Documentation examples check out. Inspected ${count} blocks.`);
}

main();

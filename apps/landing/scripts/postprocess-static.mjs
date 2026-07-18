import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const nextScriptPreloadPattern =
  /<link\b(?=[^>]*\brel=(['"])preload\1)(?=[^>]*\bas=(['"])script\2)(?=[^>]*\bhref=(['"])\/_next\/static\/[^'"]+\3)[^>]*\/?>/gi;
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const scriptSourcePattern = /(?:^|\s)src\s*=\s*(['"])(.*?)\1/i;
const scriptTypePattern = /(?:^|\s)type\s*=\s*(['"])(.*?)\1/i;
const interactionScriptPattern = /^\/_next\/static\/authlane-interactions-[a-f0-9]{12}\.js$/;

/**
 * @param {string} html
 * @param {string} interactionScriptPath
 */
export function makeStaticDocument(html, interactionScriptPath) {
  const withoutNextRuntime = html
    .replace(nextScriptPreloadPattern, '')
    .replace(scriptPattern, (script, attributes, content) => {
      const source = attributes.match(scriptSourcePattern)?.[2];
      if (source?.startsWith('/_next/static/')) return '';
      if (!source && /(?:self\.)?__next_f/.test(content)) return '';
      return script;
    });

  const interactionScript = `<script type="module" src="${interactionScriptPath}" defer></script>`;
  return withoutNextRuntime.replace('</body>', `${interactionScript}</body>`);
}

/** @param {string} html */
export function staticDocumentViolations(html) {
  /** @type {string[]} */
  const violations = [];
  if (html.includes('__next_f')) violations.push('contains a Next flight payload');
  if (html.match(nextScriptPreloadPattern)?.length) {
    violations.push('contains a Next script preload');
  }

  const externalScripts = [];
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? '';
    const source = attributes.match(scriptSourcePattern)?.[2];
    if (source) {
      externalScripts.push({ attributes, source });
      if (source.startsWith('/_next/static/chunks/')) {
        violations.push(`contains a Next runtime script: ${source}`);
      }
      continue;
    }

    const type = attributes.match(scriptTypePattern)?.[2]?.toLowerCase();
    if (type !== 'application/ld+json') violations.push('contains executable inline script');
  }

  if (externalScripts.length !== 1) {
    violations.push(`expected one external interaction script, found ${externalScripts.length}`);
  } else {
    const [interaction] = externalScripts;
    const type = interaction.attributes.match(scriptTypePattern)?.[2]?.toLowerCase();
    const deferred = /(?:^|\s)defer(?:\s|=|$)/i.test(interaction.attributes);
    if (!interactionScriptPattern.test(interaction.source) || type !== 'module' || !deferred) {
      violations.push('interaction script is not a deferred fingerprinted same-origin module');
    }
  }

  return violations;
}

/** @param {string} root */
async function htmlFiles(root) {
  /** @type {string[]} */
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

async function postprocessStaticExport() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const outputDirectory = join(scriptDirectory, '..', 'out');
  const interactionSource = await readFile(
    join(scriptDirectory, 'landing-interactions.js'),
    'utf8'
  );
  const fingerprint = createHash('sha256').update(interactionSource).digest('hex').slice(0, 12);
  const interactionFileName = `authlane-interactions-${fingerprint}.js`;
  const interactionOutput = join(outputDirectory, '_next', 'static', interactionFileName);
  const interactionPublicPath = `/_next/static/${interactionFileName}`;

  await mkdir(dirname(interactionOutput), { recursive: true });
  await writeFile(interactionOutput, interactionSource);

  for (const path of await htmlFiles(outputDirectory)) {
    const html = await readFile(path, 'utf8');
    const document = makeStaticDocument(html, interactionPublicPath);
    const violations = staticDocumentViolations(document);
    if (violations.length > 0) {
      throw new Error(`${path} failed the static export contract: ${violations.join('; ')}`);
    }
    await writeFile(path, document);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await postprocessStaticExport();
}

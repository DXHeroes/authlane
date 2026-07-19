import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const nextScriptPreloadPattern =
  /<link\b(?=[^>]*\brel=(['"])preload\1)(?=[^>]*\bas=(['"])script\2)(?=[^>]*\bhref=(['"])\/_next\/static\/[^'"]+\3)[^>]*\/?>/gi;
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const scriptSourcePattern = /(?:^|\s)src\s*=\s*(['"])(.*?)\1/i;
const scriptTypePattern = /(?:^|\s)type\s*=\s*(['"])(.*?)\1/i;
const interactionScriptPattern = /^\/_next\/static\/authlane-interactions-[a-f0-9]{12}\.js$/;
const nextFlightScriptPattern = /^\/_next\/static\/authlane-next-flight-[a-f0-9]{12}\.js$/;
const nextRuntimeOrigin = 'https://authlane.invalid';
const nextRuntimePrefix = '/_next/static/chunks/';
const nextRuntimeScriptPattern =
  /^\/_next\/static\/chunks\/(?:[^/?#]+\/)*[^/?#]*[-.][a-f0-9]{16}\.js$/;

/** @param {string} source */
function isNextRuntimeScriptSource(source) {
  if (
    !source.startsWith('/') ||
    source.startsWith('//') ||
    source.includes('?') ||
    source.includes('#') ||
    source.includes('\\')
  ) {
    return false;
  }

  const decodedSegments = [];
  for (const rawSegment of source.split('/')) {
    let decodedSegment;
    try {
      decodedSegment = decodeURIComponent(rawSegment);
    } catch {
      return false;
    }
    if (
      decodedSegment !== rawSegment ||
      decodedSegment === '.' ||
      decodedSegment === '..' ||
      decodedSegment.includes('/') ||
      decodedSegment.includes('\\')
    ) {
      return false;
    }
    decodedSegments.push(decodedSegment);
  }

  const decodedPathname = decodedSegments.join('/');
  let parsedSource;
  let normalizedDecodedPath;
  try {
    parsedSource = new URL(source, nextRuntimeOrigin);
    normalizedDecodedPath = new URL(decodedPathname, nextRuntimeOrigin).pathname;
  } catch {
    return false;
  }

  return (
    parsedSource.origin === nextRuntimeOrigin &&
    parsedSource.pathname === source &&
    parsedSource.pathname === normalizedDecodedPath &&
    parsedSource.pathname.startsWith(nextRuntimePrefix) &&
    nextRuntimeScriptPattern.test(parsedSource.pathname)
  );
}

/** @param {string} content */
function isNextFlightPayload(content) {
  const source = content.trim();
  if (/^\(self\.__next_f\s*=\s*self\.__next_f\s*\|\|\s*\[\]\)\.push\(\[0\]\)\s*;?$/.test(source)) {
    return true;
  }

  const push = source.match(/^self\.__next_f\.push\(([\s\S]*)\)\s*;?$/);
  if (!push) return false;

  try {
    const payload = JSON.parse(push[1]);
    return (
      Array.isArray(payload) &&
      payload.length === 2 &&
      payload[0] === 1 &&
      typeof payload[1] === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} content
 * @returns {{ fileName: string; publicPath: string; source: string }}
 */
function flightAsset(content) {
  const source = content.trim();
  const fingerprint = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const fileName = `authlane-next-flight-${fingerprint}.js`;
  return { fileName, publicPath: `/_next/static/${fileName}`, source };
}

/** @param {string} html */
export function scalarHydrationAssets(html) {
  return [...html.matchAll(scriptPattern)].flatMap((match) => {
    const attributes = match[1] ?? '';
    const content = match[2] ?? '';
    if (attributes.trim() || !isNextFlightPayload(content)) return [];
    return [flightAsset(content)];
  });
}

/**
 * @param {string} html
 * @param {string} interactionScriptPath
 * @param {'static' | 'scalar'} mode
 */
export function makeStaticDocument(html, interactionScriptPath, mode) {
  const preparedDocument =
    mode === 'scalar'
      ? html.replace(scriptPattern, (script, attributes, content) => {
          if (attributes.trim() || !isNextFlightPayload(content)) return script;
          const asset = flightAsset(content);
          return `<script src="${asset.publicPath}"></script>`;
        })
      : html
          .replace(nextScriptPreloadPattern, '')
          .replace(scriptPattern, (script, attributes, content) => {
            const source = attributes.match(scriptSourcePattern)?.[2];
            if (source?.startsWith('/_next/static/')) return '';
            if (!source && !attributes.trim() && isNextFlightPayload(content)) return '';
            return script;
          });

  const interactionScript = `<script type="module" src="${interactionScriptPath}" defer></script>`;
  return preparedDocument.replace('</body>', `${interactionScript}</body>`);
}

/**
 * @param {string} html
 * @param {'static' | 'scalar'} mode
 */
export function staticDocumentViolations(html, mode) {
  /** @type {string[]} */
  const violations = [];
  if (mode === 'static' && html.includes('__next_f')) {
    violations.push('contains a Next flight payload');
  }
  if (mode === 'static' && html.match(nextScriptPreloadPattern)?.length) {
    violations.push('contains a Next script preload');
  }

  const interactionScripts = [];
  let nextFlightScripts = 0;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? '';
    const source = attributes.match(scriptSourcePattern)?.[2];
    if (source) {
      if (source.startsWith('/_next/static/authlane-interactions')) {
        interactionScripts.push({ attributes, source });
      } else if (nextFlightScriptPattern.test(source)) {
        if (mode === 'scalar') {
          nextFlightScripts += 1;
        } else {
          violations.push(`contains a Scalar hydration script: ${source}`);
        }
      } else if (mode === 'static' && source.startsWith('/_next/static/')) {
        violations.push(`contains a Next runtime script: ${source}`);
      } else if (mode === 'scalar' && isNextRuntimeScriptSource(source)) {
        continue;
      } else if (mode === 'scalar' && source.startsWith('/_next/static/')) {
        violations.push(`contains an unexpected or non-fingerprinted Next script: ${source}`);
      } else {
        violations.push(`contains an unexpected external script: ${source}`);
      }
      continue;
    }

    const type = attributes.match(scriptTypePattern)?.[2]?.toLowerCase();
    if (type !== 'application/ld+json') {
      violations.push('contains executable inline script');
    }
  }

  if (mode === 'scalar' && nextFlightScripts === 0) {
    violations.push('expected at least one fingerprinted Scalar hydration script');
  }

  if (interactionScripts.length !== 1) {
    violations.push(`expected one external interaction script, found ${interactionScripts.length}`);
  } else {
    const [interaction] = interactionScripts;
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
    const relativeOutputPath = relative(outputDirectory, path).split(sep).join('/');
    const mode = relativeOutputPath === 'docs/api-reference/index.html' ? 'scalar' : 'static';
    if (mode === 'scalar') {
      for (const asset of scalarHydrationAssets(html)) {
        await writeFile(join(outputDirectory, '_next', 'static', asset.fileName), asset.source);
      }
    }
    const document = makeStaticDocument(html, interactionPublicPath, mode);
    const violations = staticDocumentViolations(document, mode);
    if (violations.length > 0) {
      throw new Error(`${path} failed the static export contract: ${violations.join('; ')}`);
    }
    await writeFile(path, document);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await postprocessStaticExport();
}

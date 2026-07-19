import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultTimeoutMs = 10_000;
const defaultConcurrency = 4;
const defaultMaxAttempts = 2;
const sourceExtensions = new Set(['.mdx']);
const unsuitableHeadStatuses = new Set([403, 405, 501]);
const excludedSourceDirectories = new Set([
  '.cache',
  '.mintlify',
  '.next',
  '__fixtures__',
  'build',
  'cache',
  'coverage',
  'dist',
  'fixtures',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
]);

export function isExcludedSourceDirectory(name) {
  return excludedSourceDirectories.has(name.toLowerCase());
}

function isPlaceholderHost(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    /^(?:.+\.)?example\.(?:com|net|org)$/.test(normalized)
  );
}

function isPublicCheckTarget(url, sourceValue) {
  if (url.username || url.password) return false;
  if (url.hostname === 'app.authlane.io' && url.pathname.startsWith('/api/')) return false;
  if (
    /[{}*]|redacted/i.test(sourceValue) ||
    /\b(?:[\w-]+\.)*example\.(?:com|net|org)\b/i.test(sourceValue)
  ) {
    return false;
  }

  if (
    /(?:^|\/)oauth(?:\/[^/]+)?\/callback(?:\/|$)/i.test(url.pathname) ||
    /(?:^|\/)(?:verify(?:-email)?|reset(?:-password)?|invite|accept-invitation|userinfo)(?:\/|$)/i.test(
      url.pathname
    )
  ) {
    return false;
  }

  const sensitiveName = /(token|session|code|state|secret|key)/i;
  if ([...url.searchParams.keys()].some((name) => sensitiveName.test(name))) return false;
  if (url.hash.includes('=')) {
    const fragment = new URLSearchParams(url.hash.slice(1));
    if ([...fragment.keys()].some((name) => sensitiveName.test(name))) return false;
  }
  return true;
}

function sourceWithoutCode(source) {
  const output = [];
  let fence = null;

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    output.push(line.replace(/(`+)[^`]*\1/g, ''));
  }

  return output.join('\n');
}

function markdownLinkTargets(source) {
  const visible = sourceWithoutCode(source);
  const targets = [];
  for (const match of visible.matchAll(/!?\[[^\]]*]\(\s*(https?:\/\/[^\s)]+)[^)]*\)/g)) {
    targets.push(match[1]);
  }
  for (const match of visible.matchAll(/<(https?:\/\/[^>\s]+)>/g)) targets.push(match[1]);
  for (const match of visible.matchAll(/\bhref\s*=\s*(['"])(https?:\/\/[^'"]+)\1/g)) {
    targets.push(match[2]);
  }
  return targets;
}

function configuredPublicTargets(configuration) {
  const targets = [];

  function visit(value, key = '') {
    if (typeof value === 'string') {
      if (key === 'url' || key === 'href' || key === 'footerSocial') targets.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === 'footerSocials' && child && typeof child === 'object') {
        for (const socialUrl of Object.values(child)) visit(socialUrl, 'footerSocial');
      } else {
        visit(child, childKey);
      }
    }
  }

  visit(configuration);
  return targets;
}

export function extractPublicHttpUrls(sources, configuration = null) {
  const urls = new Set();
  const targets = [
    ...sources.flatMap((source) => markdownLinkTargets(source)),
    ...configuredPublicTargets(configuration),
  ];

  for (const target of targets) {
    const candidate = target.replace(/[\])}>.,;:!?]+$/g, '');
    try {
      const url = new URL(candidate);
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !isPlaceholderHost(url.hostname) &&
        isPublicCheckTarget(url, candidate)
      ) {
        urls.add(url.href);
      }
    } catch {
      // Ignore malformed authoring targets; deterministic docs validation reports source syntax.
    }
  }
  return [...urls].sort((left, right) => left.localeCompare(right));
}

function resultFromResponse(originalUrl, response) {
  return {
    originalUrl,
    finalUrl: response.url || originalUrl,
    status: response.status,
    error: null,
  };
}

function resultFromError(originalUrl, error) {
  const message = error instanceof Error ? error.message : String(error);
  return { originalUrl, finalUrl: originalUrl, status: null, error: message };
}

async function request(url, method, fetchImpl, timeoutMs) {
  return fetchImpl(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function isTransient(result) {
  return result.error !== null || result.status === 429 || (result.status ?? 0) >= 500;
}

function boundedPositiveInteger(value, defaultValue, maximum) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : defaultValue;
}

export async function checkPublicUrl(
  originalUrl,
  { fetchImpl = fetch, timeoutMs = defaultTimeoutMs, maxAttempts = defaultMaxAttempts } = {}
) {
  let result = resultFromError(originalUrl, new Error('URL check did not run'));
  const attemptLimit = boundedPositiveInteger(maxAttempts, defaultMaxAttempts, defaultMaxAttempts);
  const requestTimeoutMs = boundedPositiveInteger(timeoutMs, defaultTimeoutMs, defaultTimeoutMs);

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    try {
      const head = await request(originalUrl, 'HEAD', fetchImpl, requestTimeoutMs);
      const response = unsuitableHeadStatuses.has(head.status)
        ? await request(originalUrl, 'GET', fetchImpl, requestTimeoutMs)
        : head;
      result = resultFromResponse(originalUrl, response);
    } catch (error) {
      result = resultFromError(originalUrl, error);
    }

    if (!isTransient(result) || attempt === attemptLimit) return result;
  }

  return result;
}

export async function checkPublicUrls(urls, { concurrency = defaultConcurrency, ...options } = {}) {
  const results = new Array(urls.length);
  let nextIndex = 0;
  const concurrencyLimit = boundedPositiveInteger(
    concurrency,
    defaultConcurrency,
    defaultConcurrency
  );
  const workerCount = Math.min(concurrencyLimit, urls.length);

  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await checkPublicUrl(urls[index], options);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function formatLinkResult(result) {
  if (result.error !== null) {
    return `${result.originalUrl} -> ${result.finalUrl} [network error: ${result.error}]`;
  }
  return `${result.originalUrl} -> ${result.finalUrl} [${result.status}]`;
}

export function linkCheckExitCode(urls, results) {
  if (urls.length === 0 || results.length !== urls.length) return 1;
  return results.some(
    (result) => result.error !== null || (result.status !== null && result.status >= 400)
  )
    ? 1
    : 0;
}

export function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return isExcludedSourceDirectory(entry.name) ? [] : collectSourceFiles(path);
      }
      return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const sourceFiles = [
    resolve(root, 'README.md'),
    ...collectSourceFiles(resolve(root, 'apps/docs')),
  ];
  const mint = JSON.parse(readFileSync(resolve(root, 'apps/docs/mint.json'), 'utf8'));
  const urls = extractPublicHttpUrls(
    sourceFiles.map((path) => readFileSync(path, 'utf8')),
    mint
  );
  const results = await checkPublicUrls(urls);

  console.log(`Checked ${results.length} unique public documentation URLs.`);
  for (const result of results) console.log(formatLinkResult(result));

  if (urls.length === 0) console.error('No public documentation link targets found.');
  process.exitCode = linkCheckExitCode(urls, results);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

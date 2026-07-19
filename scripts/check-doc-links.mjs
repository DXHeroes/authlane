import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultTimeoutMs = 10_000;
const defaultConcurrency = 4;
const defaultMaxAttempts = 2;
const sourceExtensions = new Set(['.json', '.mdx', '.yaml', '.yml']);
const unsuitableHeadStatuses = new Set([403, 405, 501]);

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
  if (url.hostname === 'app.authlane.io' && url.pathname.startsWith('/api/')) return false;
  return !(
    /[{}*]|redacted/i.test(sourceValue) ||
    /\b(?:[\w-]+\.)*example\.(?:com|net|org)\b/i.test(sourceValue)
  );
}

export function extractPublicHttpUrls(sources) {
  const urls = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/g)) {
      const candidate = match[0].replace(/[\])}>.,;:!?]+$/g, '');
      try {
        const url = new URL(candidate);
        if (!isPlaceholderHost(url.hostname) && isPublicCheckTarget(url, candidate)) {
          urls.add(url.href);
        }
      } catch {
        // Ignore incomplete authoring placeholders that are not valid absolute URLs.
      }
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

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(path);
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
  const urls = extractPublicHttpUrls(sourceFiles.map((path) => readFileSync(path, 'utf8')));
  const results = await checkPublicUrls(urls);

  console.log(`Checked ${results.length} unique public documentation URLs.`);
  for (const result of results) console.log(formatLinkResult(result));

  if (
    results.some(
      (result) => result.error !== null || (result.status !== null && result.status >= 400)
    )
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

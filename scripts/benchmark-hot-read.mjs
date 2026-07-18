import { pathToFileURL } from 'node:url';

export const BENCHMARK_NAME = 'authlane.control-plane.capabilities.mcp.hot-read';
export const BENCHMARK_ENDPOINT = 'GET /api/v1/users/{external_user_id}/capabilities?format=mcp';
export const BENCHMARK_SCOPE =
  'Status and tool-definition capability reads only; excludes credential lease issuance and provider execution.';
export const HARD_P95_TARGET_MS = 100;
export const MIN_ACHIEVED_RPS_RATIO = 0.95;
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const MAX_REQUEST_TIMEOUT_MS = 30_000;

const MAX_TOTAL_REQUESTS = 250_000;

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a finite positive number`);
  }
  return parsed;
}

function requestTimeout(value) {
  const parsed = positiveInteger(value, 'PERF_REQUEST_TIMEOUT_MS');
  if (parsed > MAX_REQUEST_TIMEOUT_MS) {
    throw new Error(`PERF_REQUEST_TIMEOUT_MS must not exceed ${MAX_REQUEST_TIMEOUT_MS}`);
  }
  return parsed;
}

function benchmarkBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PERF_BASE_URL must be a valid HTTP or HTTPS URL');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('PERF_BASE_URL must be a credential-free HTTP or HTTPS URL');
  }
  return url;
}

function externalUserId(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 255) {
    throw new Error('PERF_EXTERNAL_USER_ID must be a non-empty user ID');
  }
  return value;
}

export function effectiveP95Target(value = HARD_P95_TARGET_MS) {
  return Math.min(positiveNumber(value, 'PERF_P95_TARGET_MS'), HARD_P95_TARGET_MS);
}

export function readBenchmarkConfig(env = process.env) {
  const requestsPerSecond = positiveInteger(env.PERF_RPS ?? 500, 'PERF_RPS');
  const durationSeconds = positiveInteger(env.PERF_DURATION_SECONDS ?? 20, 'PERF_DURATION_SECONDS');
  const totalRequests = requestsPerSecond * durationSeconds;
  if (!Number.isSafeInteger(totalRequests) || totalRequests > MAX_TOTAL_REQUESTS) {
    throw new Error(`benchmark profile must not exceed ${MAX_TOTAL_REQUESTS} total requests`);
  }

  return Object.freeze({
    baseUrl: benchmarkBaseUrl(env.PERF_BASE_URL ?? 'http://localhost:3000'),
    externalUserId: externalUserId(env.PERF_EXTERNAL_USER_ID ?? 'performance-user'),
    requestsPerSecond,
    durationSeconds,
    totalRequests,
    p95TargetMs: effectiveP95Target(env.PERF_P95_TARGET_MS ?? HARD_P95_TARGET_MS),
    requestTimeoutMs: requestTimeout(env.PERF_REQUEST_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS),
  });
}

export function evaluateBenchmarkGate({ achievedRps, failures, p95Ms, p95TargetMs, targetRps }) {
  if (!Number.isSafeInteger(failures) || failures < 0) {
    throw new Error('failures must be a non-negative integer');
  }
  if (!Number.isFinite(p95Ms) || p95Ms < 0) {
    throw new Error('p95Ms must be a finite non-negative number');
  }
  if (!Number.isFinite(achievedRps) || achievedRps < 0) {
    throw new Error('achievedRps must be a finite non-negative number');
  }
  const validatedTargetRps = positiveNumber(targetRps, 'targetRps');
  const effectiveTargetMs = effectiveP95Target(p95TargetMs);
  const minimumAchievedRps = validatedTargetRps * MIN_ACHIEVED_RPS_RATIO;
  const failureFree = failures === 0;
  const p95Passed = p95Ms <= effectiveTargetMs;
  const achievedRpsPassed = achievedRps >= minimumAchievedRps;
  return Object.freeze({
    achievedRpsPassed,
    actualAchievedRps: achievedRps,
    effectiveP95TargetMs: effectiveTargetMs,
    failureFree,
    hardMaximumP95Ms: HARD_P95_TARGET_MS,
    minimumAchievedRps,
    minimumAchievedRpsRatio: MIN_ACHIEVED_RPS_RATIO,
    p95Passed,
    passed: failureFree && p95Passed && achievedRpsPassed,
    targetRps: validatedTargetRps,
  });
}

function requestTarget(config) {
  const target = new URL(config.baseUrl);
  const basePath = target.pathname.replace(/\/+$/, '');
  target.pathname = `${basePath}/api/v1/users/${encodeURIComponent(
    config.externalUserId
  )}/capabilities`;
  target.search = '?format=mcp';
  return target;
}

function percentile(latencies, value) {
  return latencies[Math.ceil((value / 100) * latencies.length) - 1] ?? 0;
}

export async function runBenchmark(config, apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new Error('PERF_API_KEY is required');
  }

  const target = requestTarget(config);
  const requestTimeoutMs = requestTimeout(config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const latencies = [];
  let failures = 0;
  const benchmarkStartedAt = performance.now();

  await Promise.all(
    Array.from({ length: config.totalRequests }, async (_, index) => {
      const scheduledAt = benchmarkStartedAt + (index * 1_000) / config.requestsPerSecond;
      const wait = scheduledAt - performance.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

      const startedAt = performance.now();
      let failed = false;
      try {
        const response = await fetch(target, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (!response.ok) failed = true;
        // Reading the complete body is intentionally part of the measured request latency.
        await response.arrayBuffer();
      } catch {
        failed = true;
      } finally {
        if (failed) failures += 1;
        latencies.push(performance.now() - startedAt);
      }
    })
  );

  latencies.sort((a, b) => a - b);
  const elapsedSeconds = (performance.now() - benchmarkStartedAt) / 1_000;
  const achievedRps = config.totalRequests / elapsedSeconds;
  const rawP95Ms = percentile(latencies, 95);
  const gate = evaluateBenchmarkGate({
    achievedRps,
    failures,
    p95Ms: rawP95Ms,
    p95TargetMs: config.p95TargetMs,
    targetRps: config.requestsPerSecond,
  });

  return Object.freeze({
    benchmark: BENCHMARK_NAME,
    endpoint: BENCHMARK_ENDPOINT,
    scope: BENCHMARK_SCOPE,
    profile: {
      requestsPerSecond: config.requestsPerSecond,
      durationSeconds: config.durationSeconds,
      requestTimeoutMs,
      requests: config.totalRequests,
    },
    results: {
      failures,
      achievedRps: Number(achievedRps.toFixed(1)),
      p50Ms: Number(percentile(latencies, 50).toFixed(1)),
      p95Ms: Number(rawP95Ms.toFixed(1)),
      p99Ms: Number(percentile(latencies, 99).toFixed(1)),
    },
    gate,
  });
}

function publicConfig(config) {
  return {
    benchmark: BENCHMARK_NAME,
    endpoint: BENCHMARK_ENDPOINT,
    scope: BENCHMARK_SCOPE,
    profile: {
      requestsPerSecond: config.requestsPerSecond,
      durationSeconds: config.durationSeconds,
      requestTimeoutMs: config.requestTimeoutMs,
      requests: config.totalRequests,
    },
    gate: {
      effectiveP95TargetMs: config.p95TargetMs,
      hardMaximumP95Ms: HARD_P95_TARGET_MS,
      minimumAchievedRps: config.requestsPerSecond * MIN_ACHIEVED_RPS_RATIO,
      minimumAchievedRpsRatio: MIN_ACHIEVED_RPS_RATIO,
      targetRps: config.requestsPerSecond,
    },
  };
}

function printHelp() {
  console.log(`Usage: node scripts/benchmark-hot-read.mjs [--config-only]

${BENCHMARK_NAME}
${BENCHMARK_SCOPE}

Environment:
  PERF_API_KEY             scoped server key (required to run requests)
  PERF_BASE_URL            Authlane origin (default: http://localhost:3000)
  PERF_EXTERNAL_USER_ID    benchmark user (default: performance-user)
  PERF_RPS                 positive integer (default: 500)
  PERF_DURATION_SECONDS    positive integer (default: 20)
  PERF_P95_TARGET_MS       positive number; can only tighten the hard 100 ms ceiling
  PERF_REQUEST_TIMEOUT_MS  positive integer up to 30000 (default: 5000)

Options:
  --config-only            validate and print the non-sensitive effective profile
  --help                   show this help`);
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const supportedArguments = new Set(['--config-only', '--help']);
  const unknownArgument = argv.find((argument) => !supportedArguments.has(argument));
  if (unknownArgument) {
    throw new Error('unknown benchmark argument; use --help');
  }
  if (argv.includes('--help')) {
    printHelp();
    return 0;
  }

  const config = readBenchmarkConfig(env);
  if (argv.includes('--config-only')) {
    console.log(JSON.stringify(publicConfig(config), null, 2));
    return 0;
  }

  const report = await runBenchmark(config, env.PERF_API_KEY);
  console.log(JSON.stringify(report, null, 2));
  return report.gate.passed ? 0 : 1;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Benchmark failed');
    process.exitCode = 1;
  }
}

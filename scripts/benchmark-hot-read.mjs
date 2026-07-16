const baseUrl = process.env.PERF_BASE_URL ?? 'http://localhost:3000';
const apiKey = process.env.PERF_API_KEY;
const externalUserId = process.env.PERF_EXTERNAL_USER_ID ?? 'performance-user';
const requestsPerSecond = Number(process.env.PERF_RPS ?? 500);
const durationSeconds = Number(process.env.PERF_DURATION_SECONDS ?? 20);
const p95TargetMs = Number(process.env.PERF_P95_TARGET_MS ?? 100);

if (!apiKey) {
  console.error('PERF_API_KEY is required');
  process.exit(1);
}

const target = `${baseUrl}/api/v1/users/${encodeURIComponent(externalUserId)}/capabilities?format=mcp`;
const totalRequests = requestsPerSecond * durationSeconds;
const latencies = [];
let failures = 0;
const benchmarkStartedAt = performance.now();

await Promise.all(
  Array.from({ length: totalRequests }, async (_, index) => {
    const scheduledAt = benchmarkStartedAt + (index * 1_000) / requestsPerSecond;
    const wait = scheduledAt - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const startedAt = performance.now();
    try {
      const response = await fetch(target, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - startedAt);
    }
  })
);

latencies.sort((a, b) => a - b);
const elapsedSeconds = (performance.now() - benchmarkStartedAt) / 1_000;
const percentile = (value) => latencies[Math.ceil((value / 100) * latencies.length) - 1] ?? 0;
const report = {
  target,
  requests: totalRequests,
  failures,
  achievedRps: Number((totalRequests / elapsedSeconds).toFixed(1)),
  p50Ms: Number(percentile(50).toFixed(1)),
  p95Ms: Number(percentile(95).toFixed(1)),
  p99Ms: Number(percentile(99).toFixed(1)),
  targetP95Ms: p95TargetMs,
};

console.log(JSON.stringify(report, null, 2));
if (failures > 0 || report.p95Ms > p95TargetMs) process.exit(1);

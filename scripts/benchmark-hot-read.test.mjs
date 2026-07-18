import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { evaluateBenchmarkGate, readBenchmarkConfig, runBenchmark } from './benchmark-hot-read.mjs';

function benchmarkConfig(overrides = {}) {
  return {
    ...readBenchmarkConfig({
      PERF_BASE_URL: 'http://localhost:3000',
      PERF_DURATION_SECONDS: '1',
      PERF_EXTERNAL_USER_ID: 'performance-user',
      PERF_RPS: '1',
    }),
    ...overrides,
  };
}

async function withRuntimeStubs(nowValues, callback) {
  const originalFetch = globalThis.fetch;
  const originalPerformance = globalThis.performance;
  let nextNowValue = 0;

  globalThis.performance = {
    now() {
      const value = nowValues[nextNowValue];
      nextNowValue += 1;
      assert.notEqual(value, undefined, 'unexpected performance.now() call');
      return value;
    },
  };
  globalThis.fetch = async () => new Response(null, { status: 200 });

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.performance = originalPerformance;
  }
}

test('evaluates raw P95 before rounding the reported metric', async () => {
  for (const rawP95Ms of [100.01, 100.049]) {
    const report = await withRuntimeStubs([0, 0, 0, rawP95Ms, 1_000], () =>
      runBenchmark(benchmarkConfig(), 'server-key')
    );

    assert.equal(report.results.p95Ms, 100);
    assert.equal(report.gate.p95Passed, false);
    assert.equal(report.gate.passed, false);
  }
});

test('fails an underdelivered request-rate profile independently of request failures', async () => {
  const report = await withRuntimeStubs([0, 0, 0, 5, 2_000], () =>
    runBenchmark(benchmarkConfig(), 'server-key')
  );

  assert.equal(report.results.failures, 0);
  assert.equal(report.gate.failureFree, true);
  assert.equal(report.gate.p95Passed, true);
  assert.equal(report.gate.targetRps, 1);
  assert.equal(report.gate.minimumAchievedRps, 0.95);
  assert.equal(report.gate.actualAchievedRps, 0.5);
  assert.equal(report.gate.achievedRpsPassed, false);
  assert.equal(report.gate.passed, false);
});

test('reports response failures independently when the request-rate profile is delivered', () => {
  const gate = evaluateBenchmarkGate({
    achievedRps: 500,
    failures: 1,
    p95Ms: 10,
    p95TargetMs: 100,
    targetRps: 500,
  });

  assert.equal(gate.achievedRpsPassed, true);
  assert.equal(gate.failureFree, false);
  assert.equal(gate.p95Passed, true);
  assert.equal(gate.passed, false);
});

test('uses a bounded request timeout by default', () => {
  assert.equal(benchmarkConfig().requestTimeoutMs, 5_000);
});

test('rejects request timeouts above the hard maximum', () => {
  assert.throws(
    () =>
      readBenchmarkConfig({
        PERF_REQUEST_TIMEOUT_MS: '30001',
      }),
    /PERF_REQUEST_TIMEOUT_MS must not exceed 30000/
  );
});

test('times out while consuming a stalled response body and records a request failure', async () => {
  let finishResponse;
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"data":');
    finishResponse = setTimeout(() => response.end('{}'), 2_000);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');

  try {
    const startedAt = Date.now();
    const report = await runBenchmark(
      benchmarkConfig({
        baseUrl: new URL(`http://127.0.0.1:${address.port}`),
        requestTimeoutMs: 50,
      }),
      'server-key'
    );

    assert.equal(report.results.failures, 1);
    assert.equal(report.gate.failureFree, false);
    assert.equal(JSON.stringify(report).includes('server-key'), false);
    assert.ok(Date.now() - startedAt < 1_000, 'the complete-body timeout must bound the request');
  } finally {
    clearTimeout(finishResponse);
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

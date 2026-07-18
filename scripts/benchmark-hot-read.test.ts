import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { evaluateBenchmarkGate, readBenchmarkConfig, runBenchmark } from './benchmark-hot-read.mjs';

type BenchmarkConfig = ReturnType<typeof readBenchmarkConfig>;

function benchmarkConfig(overrides: Partial<BenchmarkConfig> = {}): BenchmarkConfig {
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

async function withRuntimeStubs<T>(
  nowValues: readonly number[],
  callback: () => Promise<T>
): Promise<T> {
  let nextNowValue = 0;

  vi.stubGlobal('performance', {
    now() {
      const value = nowValues[nextNowValue];
      nextNowValue += 1;
      expect(value, 'unexpected performance.now() call').toBeDefined();
      return value ?? 0;
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 }))
  );

  return callback();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hot-read benchmark acceptance gate', () => {
  it.each([100.01, 100.049])('evaluates raw P95 %f ms before report rounding', async (rawP95Ms) => {
    const report = await withRuntimeStubs([0, 0, 0, rawP95Ms, 1_000], () =>
      runBenchmark(benchmarkConfig(), 'server-key')
    );

    expect(report.results.p95Ms).toBe(100);
    expect(report.gate.p95Passed).toBe(false);
    expect(report.gate.passed).toBe(false);
  });

  it('fails an underdelivered request-rate profile independently of request failures', async () => {
    const report = await withRuntimeStubs([0, 0, 0, 5, 2_000], () =>
      runBenchmark(benchmarkConfig(), 'server-key')
    );

    expect(report.results.failures).toBe(0);
    expect(report.gate.failureFree).toBe(true);
    expect(report.gate.p95Passed).toBe(true);
    expect(report.gate.targetRps).toBe(1);
    expect(report.gate.minimumAchievedRps).toBe(0.95);
    expect(report.gate.actualAchievedRps).toBe(0.5);
    expect(report.gate.achievedRpsPassed).toBe(false);
    expect(report.gate.passed).toBe(false);
  });

  it('reports response failures independently when the request-rate profile is delivered', () => {
    const gate = evaluateBenchmarkGate({
      achievedRps: 500,
      failures: 1,
      p95Ms: 10,
      p95TargetMs: 100,
      targetRps: 500,
    });

    expect(gate.achievedRpsPassed).toBe(true);
    expect(gate.failureFree).toBe(false);
    expect(gate.p95Passed).toBe(true);
    expect(gate.passed).toBe(false);
  });

  it('uses a bounded request timeout by default', () => {
    expect(benchmarkConfig().requestTimeoutMs).toBe(5_000);
  });

  it('rejects request timeouts above the hard maximum', () => {
    expect(() =>
      readBenchmarkConfig({
        PERF_REQUEST_TIMEOUT_MS: '30001',
      })
    ).toThrow('PERF_REQUEST_TIMEOUT_MS must not exceed 30000');
  });

  it('times out while consuming a stalled response body without leaking the API key', async () => {
    let finishResponse: ReturnType<typeof setTimeout> | undefined;
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"data":');
      finishResponse = setTimeout(() => response.end('{}'), 2_000);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    expect(address).not.toBeNull();
    expect(typeof address).toBe('object');
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the benchmark test server to use a TCP port');
    }

    try {
      const startedAt = Date.now();
      const report = await runBenchmark(
        benchmarkConfig({
          baseUrl: new URL(`http://127.0.0.1:${address.port}`),
          requestTimeoutMs: 50,
        }),
        'server-key'
      );

      expect(report.results.failures).toBe(1);
      expect(report.gate.failureFree).toBe(false);
      expect(JSON.stringify(report)).not.toContain('server-key');
      expect(Date.now() - startedAt).toBeLessThan(1_000);
    } finally {
      clearTimeout(finishResponse);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});

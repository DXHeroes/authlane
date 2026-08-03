import { describe, expect, it } from 'vitest';
import {
  bullMqConnectionOptions,
  mcpDiscoverySweepSchedule,
  outboxSweepSchedule,
} from '../../src/jobs/setup.js';

describe('BullMQ Redis configuration', () => {
  it('preserves authentication and database selection from the Redis URL', () => {
    expect(bullMqConnectionOptions('redis://worker:p%40ss@redis.internal:6381/4')).toEqual({
      host: 'redis.internal',
      port: 6381,
      username: 'worker',
      password: 'p@ss',
      db: 4,
      tls: undefined,
    });
  });

  it('enables TLS for rediss URLs and rejects other protocols', () => {
    expect(bullMqConnectionOptions('rediss://:secret@redis.internal')).toMatchObject({
      port: 6380,
      password: 'secret',
      tls: {},
    });
    expect(() => bullMqConnectionOptions('https://redis.internal')).toThrow(/redis:\/\//);
  });

  it('does not retain completed outbox sweep jobs forever', () => {
    expect(outboxSweepSchedule).toMatchObject({
      id: 'webhook-outbox-sweep',
      repeat: { every: 1_000 },
      template: { opts: { removeOnComplete: true, removeOnFail: 100 } },
    });
  });

  it('checks tenant MCP contracts hourly and keeps only a few failures', () => {
    expect(mcpDiscoverySweepSchedule).toMatchObject({
      id: 'mcp-discovery-sweep',
      repeat: { every: 60 * 60 * 1_000 },
      template: { opts: { removeOnComplete: true, removeOnFail: 20 } },
    });
  });
});

import { describe, expect, it } from 'vitest';
import { bullMqConnectionOptions } from '../../src/jobs/setup.js';

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
});

import { describe, expect, it, vi } from 'vitest';
import { createApiUsageRecorder } from '../../src/lib/api-usage-recorder.js';

/** Captures the upserts a flush performs, without a database. */
function fakeDb() {
  const writes: Array<{ organizationId: string; day: string; requests: number }> = [];
  const db = {
    writes,
    insert: () => ({
      values: (row: { organizationId: string; day: string; requests: number }) => {
        writes.push(row);
        return Object.assign(Promise.resolve(), { onConflictDoUpdate: async () => undefined });
      },
    }),
    // withTenantContext issues a SET LOCAL and runs the callback inside a transaction.
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    execute: async () => undefined,
  };
  return db as unknown as Parameters<typeof createApiUsageRecorder>[0] & { writes: typeof writes };
}

describe('API usage recorder', () => {
  it('collapses many requests into one write per organization and day', async () => {
    const db = fakeDb();
    const recorder = createApiUsageRecorder(db, 60_000);
    const at = new Date('2026-08-03T10:00:00.000Z');

    for (let index = 0; index < 25; index += 1) recorder.record('org-1', at);
    recorder.record('org-2', at);
    await recorder.flush();

    expect(db.writes).toEqual([
      { organizationId: 'org-1', day: '2026-08-03', requests: 25 },
      { organizationId: 'org-2', day: '2026-08-03', requests: 1 },
    ]);
    await recorder.stop();
  });

  it('keeps a flush that straddles midnight on the right days', async () => {
    const db = fakeDb();
    const recorder = createApiUsageRecorder(db, 60_000);

    recorder.record('org-1', new Date('2026-08-03T23:59:59.000Z'));
    recorder.record('org-1', new Date('2026-08-04T00:00:01.000Z'));
    await recorder.flush();

    expect(db.writes.map((write) => write.day)).toEqual(['2026-08-03', '2026-08-04']);
    await recorder.stop();
  });

  it('writes nothing when no request was recorded', async () => {
    const db = fakeDb();
    const recorder = createApiUsageRecorder(db, 60_000);

    await recorder.flush();

    expect(db.writes).toEqual([]);
    await recorder.stop();
  });

  it('drops the counts it has already taken, so a flush never double counts', async () => {
    const db = fakeDb();
    const recorder = createApiUsageRecorder(db, 60_000);

    recorder.record('org-1', new Date('2026-08-03T10:00:00.000Z'));
    await recorder.flush();
    await recorder.flush();

    expect(db.writes).toHaveLength(1);
    await recorder.stop();
  });

  it('survives a failed write rather than failing the request that counted', async () => {
    const db = fakeDb();
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('database is down'));
    const recorder = createApiUsageRecorder(db, 60_000);

    recorder.record('org-1', new Date('2026-08-03T10:00:00.000Z'));

    await expect(recorder.flush()).resolves.toBeUndefined();
    await recorder.stop();
  });
});

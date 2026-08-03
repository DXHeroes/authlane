import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createDashboardRouter } from '../../src/routes/dashboard.js';

/**
 * Counts how many of the route's queries bind a given value.
 *
 * Drizzle conditions hold circular references back to their table, so they are searched by walking
 * with a seen-set rather than serialized.
 */
function bindCount(conditions: unknown[], needle: string): number {
  const seen = new Set<unknown>();
  let found = 0;

  function walk(node: unknown): void {
    if (node === needle) {
      found += 1;
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const child of Object.values(node as Record<string, unknown>)) walk(child);
  }

  conditions.forEach(walk);
  return found;
}

/** Records the filters the route builds, without a database. */
function fakeDb(captured: { where: unknown[] }) {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: (condition: unknown) => {
      captured.where.push(condition);
      return chain;
    },
    orderBy: () => chain,
    limit: () => chain,
    offset: async () => [],
  };
  return { select: () => chain } as unknown as Parameters<typeof createDashboardRouter>[0];
}

async function connectionsRequest(query: string) {
  const captured = { where: [] as unknown[] };
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('organization', { id: 'org_1' } as never);
    c.set('user', { id: 'u1' } as never);
    await next();
  });
  app.route('/', createDashboardRouter(fakeDb(captured)));

  const response = await app.request(`/connections${query}`);
  return { response, captured };
}

describe('connection list filters', () => {
  it('carries the searched user id into the query', async () => {
    const { response, captured } = await connectionsRequest('?userId=user_42');

    expect(response.status).toBe(200);
    // The count and the page share one where clause, so filtering it filters both.
    expect(bindCount(captured.where, 'user_42')).toBeGreaterThan(0);
  });

  it('leaves the query alone when the search box is empty', async () => {
    const filtered = await connectionsRequest('?userId=user_42');
    const empty = await connectionsRequest('?userId=');
    const none = await connectionsRequest('');

    expect(empty.response.status).toBe(200);
    // An empty box must behave exactly like no box at all, and unlike a real search.
    expect(empty.captured.where.length).toBe(none.captured.where.length);
    expect(bindCount(empty.captured.where, 'user_42')).toBe(0);
    expect(bindCount(filtered.captured.where, 'user_42')).toBeGreaterThan(0);
  });
});

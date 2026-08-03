import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const roles = readFileSync(join(import.meta.dirname, '..', 'sql', 'roles.sql'), 'utf8');

/**
 * Tables a background job reads or writes.
 *
 * The worker role's grants are enumerated rather than schema-wide, which is deliberate — it is the
 * one role with BYPASSRLS, so its reach should be listed. The cost is that a new table used by a job
 * is invisible until the job fails at run time, in a background sweep nobody is watching. That is
 * exactly how the tenant MCP and provider tool sweeps shipped broken: both threw `permission denied`
 * on every run while looking, from the outside, like sweeps with nothing to do.
 */
const WORKER_TABLES = [
  'connections',
  'mcp_server_tools',
  'mcp_servers',
  'organization',
  'organization_services',
  'outbox_events',
  'provider_tool_discoveries',
  'secret_records',
  'services',
];

describe('worker role grants', () => {
  it.each(WORKER_TABLES)('grants authlane_worker access to %s', (table) => {
    const granted = roles
      .split('\n')
      .filter((line) => line.includes('TO authlane_worker'))
      .some((line) => new RegExp(`\\b${table}\\b`).test(line));

    expect(granted).toBe(true);
  });

  it('does not hand the worker every table in the schema', () => {
    // If this ever passes, the enumeration above stopped meaning anything.
    expect(roles).not.toMatch(/ON ALL TABLES IN SCHEMA public TO [^;]*authlane_worker/);
  });
});

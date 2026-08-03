import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildInvitationLink } from '../../src/lib/app-url.js';

const authSource = readFileSync(new URL('../../src/lib/auth.ts', import.meta.url), 'utf8');
const invitationsSource = readFileSync(
  new URL('../../src/lib/invitations.ts', import.meta.url),
  'utf8'
);
const dashboardRoutes = readFileSync(
  new URL('../../../dashboard/src/App.tsx', import.meta.url),
  'utf8'
);

describe('invitation links', () => {
  it('never reads DASHBOARD_URL', () => {
    expect(authSource).not.toContain('DASHBOARD_URL');
    expect(invitationsSource).not.toContain('DASHBOARD_URL');
  });

  it('never hardcodes a domain that is not the product', () => {
    expect(authSource).not.toContain('authlane.dev');
    expect(invitationsSource).not.toContain('authlane.dev');
  });

  it('builds both links through the shared builder', () => {
    expect(authSource).toContain('buildInvitationLink(');
    expect(invitationsSource).toContain('buildInvitationLink(');
  });

  // Two senders shipped links to a route that never existed. This fails if either side moves
  // without the other.
  it('emits a path the dashboard actually routes', () => {
    const path = new URL(buildInvitationLink('https://app.authlane.io', 'inv_123')).pathname;
    expect(path).toBe('/dashboard/accept-invitation/inv_123');

    const routePattern = path.replace('inv_123', ':invitationId');
    expect(dashboardRoutes).toContain(`path="${routePattern}"`);
  });
});

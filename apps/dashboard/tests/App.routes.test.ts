import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest runs with the package root as cwd; import.meta.url is not a file URL under the
// browser-like environment this suite uses.
const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('dashboard routes', () => {
  it('registers the invitation acceptance route the emails link to', () => {
    expect(source).toContain('accept-invitation/:invitationId');
  });

  it('registers the MCP servers page the sidebar links to', () => {
    expect(source).toContain('path="mcp-servers"');
  });

  it('registers the consent screen the OAuth provider redirects to', () => {
    // Must agree with `consentPage` in apps/api/src/lib/oidc-provider-config.ts.
    expect(source).toContain('path="/oauth/consent"');
  });

  it('registers the connected apps page the sidebar links to', () => {
    expect(source).toContain('path="oauth-clients"');
  });

  // What LoginRoute and ConsentRoute actually decide is asserted by rendering them, in
  // tests/components/AppRoutes.test.tsx. Grepping for the identifiers they call cannot tell a
  // correct condition from an inverted one, and inverted is the failure that matters here.

  it('keeps the consent screen outside the organization gate', () => {
    // ProtectedRoute sends anyone without an organization to /onboarding. A user consenting has a
    // workspace but has not necessarily made one active, and being bounced mid-flow would leave
    // the application that asked waiting for a callback that never arrives.
    const protectedBlock = source.slice(
      source.indexOf('path="/dashboard"'),
      source.indexOf('<Route path="/" element=')
    );
    expect(protectedBlock).not.toContain('/oauth/consent');
  });

  it('keeps invitation acceptance outside the organization gate', () => {
    // An invited user has no organization yet. ProtectedRoute redirects anyone with none to
    // /onboarding, so putting this route inside it would make every invitation link dead.
    const protectedBlock = source.slice(
      source.indexOf('path="/dashboard"'),
      source.indexOf('<Route path="/" element=')
    );
    expect(protectedBlock).not.toContain('accept-invitation');
  });
});

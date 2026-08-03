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

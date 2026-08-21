import { describe, expect, it } from 'vitest';
import { brandingOf, deriveInitials } from '../../src/lib/service-branding.js';

const bare = {
  name: 'Example',
  description: null,
  iconPath: null,
  brandColor: null,
  initials: null,
  category: null,
};

describe('deriveInitials', () => {
  it('takes one letter from each of the first two words', () => {
    expect(deriveInitials('Google Calendar')).toBe('GC');
    expect(deriveInitials('Microsoft Drive (SharePoint)')).toBe('MD');
  });

  it('takes two letters from a single word', () => {
    expect(deriveInitials('Notion')).toBe('NO');
  });

  it('reads through the punctuation a tenant names a server with', () => {
    expect(deriveInitials('mcp-acme-crm')).toBe('MA');
    expect(deriveInitials('  linear  ')).toBe('LI');
  });

  it('never returns nothing to render', () => {
    expect(deriveInitials('')).toBe('?');
    expect(deriveInitials('---')).toBe('?');
  });
});

describe('brandingOf', () => {
  it('resolves a stored path against the origin the request came in on', () => {
    expect(
      brandingOf({ ...bare, iconPath: '/service-icons/github.svg' }, 'https://app.authlane.io')
    ).toMatchObject({ iconUrl: 'https://app.authlane.io/service-icons/github.svg' });
  });

  it('leaves an already-absolute icon alone', () => {
    // Nothing stores one yet. It is the shape a tenant-supplied MCP server icon would take, and
    // costs nothing to support now rather than as a second branch later.
    expect(
      brandingOf({ ...bare, iconPath: 'https://cdn.example/logo.png' }, 'https://app.authlane.io')
    ).toMatchObject({ iconUrl: 'https://cdn.example/logo.png' });
  });

  it('prefers the stored initials over the derived ones', () => {
    // GitHub would derive to GI, and the three Microsoft services would all be MI.
    expect(brandingOf({ ...bare, name: 'GitHub', initials: 'GH' }, 'https://a.io').initials).toBe(
      'GH'
    );
  });

  it('gives a row that stores no branding something to render anyway', () => {
    expect(brandingOf({ ...bare, name: 'Acme CRM' }, 'https://app.authlane.io')).toEqual({
      description: null,
      iconUrl: null,
      brandColor: null,
      initials: 'AC',
      category: null,
    });
  });
});

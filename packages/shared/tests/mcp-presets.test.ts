import { describe, expect, it } from 'vitest';
import { parseServerUrl } from '../src/mcp-discovery.js';
import { findMcpServerPreset, MCP_SERVER_PRESETS } from '../src/mcp-presets.js';

describe('the MCP server catalogue', () => {
  it('offers a usable number of servers', () => {
    // A catalogue small enough to hand-check is not worth the UI; this is the reason it exists.
    expect(MCP_SERVER_PRESETS.length).toBeGreaterThanOrEqual(40);
  });

  it.each(MCP_SERVER_PRESETS.map((entry) => [entry.key, entry] as const))(
    'gives %s a URL registration would accept',
    (_key, entry) => {
      // Every preset must survive the same parse a hand-typed URL goes through, or the catalogue
      // would offer entries that fail the moment someone picks them.
      const parsed = parseServerUrl(entry.serverUrl);
      expect(parsed).not.toBeNull();
      expect(parsed?.url.startsWith('https://')).toBe(true);
    }
  );

  it('has no duplicate keys or URLs', () => {
    const keys = MCP_SERVER_PRESETS.map((entry) => entry.key);
    const urls = MCP_SERVER_PRESETS.map((entry) => entry.serverUrl);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('records when each entry was last confirmed to answer', () => {
    for (const entry of MCP_SERVER_PRESETS) {
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.docsUrl.startsWith('https://')).toBe(true);
    }
  });

  it('says which servers need the tenant to bring their own OAuth application', () => {
    const withoutRegistration = MCP_SERVER_PRESETS.filter((entry) => !entry.dynamicRegistration);

    // Slack and HubSpot advertise no registration endpoint. Claiming otherwise would send a tenant
    // into an authorization that cannot complete.
    expect(withoutRegistration.map((entry) => entry.key)).toContain('slack');
    expect(withoutRegistration.map((entry) => entry.key)).toContain('hubspot');
  });

  it('never collides with a built-in service id namespace', () => {
    // A preset key is only a catalogue label. If one were treated as a service id it would reach
    // code that indexes compiled tool contracts.
    for (const entry of MCP_SERVER_PRESETS) {
      expect(entry.key.startsWith('mcp-')).toBe(false);
    }
  });

  it('finds an entry by key and nothing by a made-up one', () => {
    expect(findMcpServerPreset('linear')?.serverUrl).toBe('https://mcp.linear.app/mcp');
    expect(findMcpServerPreset('nope')).toBeUndefined();
  });
});

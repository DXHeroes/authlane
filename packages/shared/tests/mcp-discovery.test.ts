import { describe, expect, it } from 'vitest';
import {
  isPrivateAddress,
  isSameHostOrSubdomain,
  normalizeDiscoveredTools,
  parseServerUrl,
} from '../src/mcp-discovery.js';

describe('parseServerUrl', () => {
  it('accepts an https URL', () => {
    expect(parseServerUrl('https://mcp.example.com/mcp')).toEqual({
      url: 'https://mcp.example.com/mcp',
      host: 'mcp.example.com',
    });
  });

  it('rejects plaintext http', () => {
    expect(parseServerUrl('http://mcp.example.com')).toBeNull();
  });

  it('rejects a non-http scheme', () => {
    expect(parseServerUrl('file:///etc/passwd')).toBeNull();
    expect(parseServerUrl('ftp://mcp.example.com')).toBeNull();
  });

  it('rejects a URL carrying credentials', () => {
    // Credentials in the URL would end up in logs and in the stored server_url.
    expect(parseServerUrl('https://user:pass@mcp.example.com')).toBeNull();
  });

  it('rejects nonsense', () => {
    expect(parseServerUrl('not a url')).toBeNull();
    expect(parseServerUrl('')).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it('rejects loopback', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('127.1.2.3')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
  });

  it('rejects RFC 1918 ranges', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.31.255.255')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
  });

  it('allows the public neighbours of those ranges', () => {
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('11.0.0.1')).toBe(false);
    expect(isPrivateAddress('193.168.1.1')).toBe(false);
  });

  it('rejects link-local and cloud metadata', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  it('rejects unique-local IPv6', () => {
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fd12:3456::1')).toBe(true);
  });

  it('rejects IPv4-mapped IPv6 loopback', () => {
    // ::ffff:127.0.0.1 reaches the loopback interface despite looking like IPv6.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('rejects the unspecified address', () => {
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
    expect(isPrivateAddress('::')).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});

describe('isSameHostOrSubdomain', () => {
  it('accepts the same host', () => {
    expect(isSameHostOrSubdomain('mcp.example.com', 'https://mcp.example.com/token')).toBe(true);
  });

  it('accepts a subdomain of the registered host', () => {
    expect(isSameHostOrSubdomain('example.com', 'https://auth.example.com/token')).toBe(true);
  });

  it('rejects a different domain', () => {
    expect(isSameHostOrSubdomain('mcp.example.com', 'https://evil.com/token')).toBe(false);
  });

  it('rejects a suffix that is not a domain boundary', () => {
    // notexample.com must not pass as a subdomain of example.com.
    expect(isSameHostOrSubdomain('example.com', 'https://notexample.com/token')).toBe(false);
  });

  it('rejects a parent of the registered host', () => {
    // Registering mcp.example.com must not authorise example.com.
    expect(isSameHostOrSubdomain('mcp.example.com', 'https://example.com/token')).toBe(false);
  });

  it('rejects plaintext endpoints', () => {
    expect(isSameHostOrSubdomain('example.com', 'http://auth.example.com/token')).toBe(false);
  });
});

describe('normalizeDiscoveredTools', () => {
  const serverId = 'mcp-1234';

  it('normalizes a well-formed tools/list result', () => {
    const tools = normalizeDiscoveredTools(serverId, {
      tools: [
        {
          name: 'search_docs',
          description: 'Search the docs',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
          annotations: { readOnlyHint: true },
        },
      ],
    });

    expect(tools).toEqual([
      {
        serverId,
        name: 'search_docs',
        description: 'Search the docs',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        declaredAnnotations: { readOnlyHint: true },
        risk: 'write',
      },
    ]);
  });

  it('always assigns write risk regardless of what the server claims', () => {
    const [tool] = normalizeDiscoveredTools(serverId, {
      tools: [{ name: 'delete_everything', inputSchema: {}, annotations: { readOnlyHint: true } }],
    });
    expect(tool?.risk).toBe('write');
  });

  it('defaults a missing input schema to an empty object schema', () => {
    const [tool] = normalizeDiscoveredTools(serverId, { tools: [{ name: 'ping' }] });
    expect(tool?.inputSchema).toEqual({ type: 'object' });
  });

  it('drops tools with an unusable name', () => {
    const tools = normalizeDiscoveredTools(serverId, {
      tools: [{ name: '' }, { name: 'x'.repeat(300) }, { name: 42 }, { name: 'ok' }],
    });
    expect(tools.map((tool) => tool.name)).toEqual(['ok']);
  });

  it('keeps the first of duplicate names', () => {
    const tools = normalizeDiscoveredTools(serverId, {
      tools: [
        { name: 'dup', description: 'first' },
        { name: 'dup', description: 'second' },
      ],
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.description).toBe('first');
  });

  it('returns nothing for a malformed payload rather than throwing', () => {
    expect(normalizeDiscoveredTools(serverId, null)).toEqual([]);
    expect(normalizeDiscoveredTools(serverId, {})).toEqual([]);
    expect(normalizeDiscoveredTools(serverId, { tools: 'nope' })).toEqual([]);
    expect(normalizeDiscoveredTools(serverId, { tools: [null, 7] })).toEqual([]);
  });

  it('truncates an overlong description instead of dropping the tool', () => {
    const [tool] = normalizeDiscoveredTools(serverId, {
      tools: [{ name: 'verbose', description: 'd'.repeat(5000) }],
    });
    expect(tool?.description.length).toBeLessThanOrEqual(1024);
  });
});

import { describe, expect, it } from 'vitest';
import { parseMcpServerRegistration, parseMcpToolUpdate } from '../../src/lib/mcp-server-input.js';

describe('parseMcpServerRegistration', () => {
  it('accepts a well-formed registration', () => {
    expect(
      parseMcpServerRegistration({
        name: '  Support desk  ',
        serverUrl: 'https://mcp.example.com/mcp/',
        authType: 'oauth2',
      })
    ).toEqual({ name: 'Support desk', serverUrl: 'https://mcp.example.com/mcp', authType: 'oauth2' });
  });

  it('rejects a plaintext URL', () => {
    expect(
      parseMcpServerRegistration({
        name: 'x',
        serverUrl: 'http://mcp.example.com',
        authType: 'oauth2',
      })
    ).toBeNull();
  });

  it('rejects a URL carrying credentials', () => {
    expect(
      parseMcpServerRegistration({
        name: 'x',
        serverUrl: 'https://user:pw@mcp.example.com',
        authType: 'api_key',
      })
    ).toBeNull();
  });

  it('rejects an unknown auth type', () => {
    expect(
      parseMcpServerRegistration({
        name: 'x',
        serverUrl: 'https://mcp.example.com',
        authType: 'basic',
      })
    ).toBeNull();
  });

  it('rejects a blank or oversized name', () => {
    const base = { serverUrl: 'https://mcp.example.com', authType: 'oauth2' };
    expect(parseMcpServerRegistration({ ...base, name: '   ' })).toBeNull();
    expect(parseMcpServerRegistration({ ...base, name: 'n'.repeat(200) })).toBeNull();
  });

  it('rejects a non-object body', () => {
    expect(parseMcpServerRegistration(null)).toBeNull();
    expect(parseMcpServerRegistration('nope')).toBeNull();
    expect(parseMcpServerRegistration([])).toBeNull();
  });
});

describe('parseMcpToolUpdate', () => {
  it('accepts a risk change', () => {
    expect(parseMcpToolUpdate({ risk: 'read' })).toEqual({ risk: 'read' });
  });

  it('accepts switching a tool off', () => {
    expect(parseMcpToolUpdate({ approved: false })).toEqual({ approved: false });
  });

  it('accepts both together', () => {
    expect(parseMcpToolUpdate({ risk: 'destructive', approved: true })).toEqual({
      risk: 'destructive',
      approved: true,
    });
  });

  it('rejects an unknown risk', () => {
    expect(parseMcpToolUpdate({ risk: 'harmless' })).toBeNull();
  });

  it('rejects a non-boolean approval', () => {
    expect(parseMcpToolUpdate({ approved: 'yes' })).toBeNull();
  });

  it('rejects an empty change set', () => {
    expect(parseMcpToolUpdate({})).toBeNull();
  });
});

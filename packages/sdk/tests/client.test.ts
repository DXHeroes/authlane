/**
 * Unit tests for Authlane client
 */

import { describe, expect, it } from 'vitest';
import { Authlane } from '../src/client.js';

describe('Authlane Client', () => {
  it('should create a client with valid config', () => {
    const client = new Authlane({
      apiKey: 'test_api_key',
    });

    expect(client).toBeDefined();
    expect(client.connections).toBeDefined();
    expect(client.services).toBeDefined();
    expect(client.tools).toBeDefined();
  });

  it('should throw error when API key is missing', () => {
    expect(() => {
      new Authlane({
        apiKey: '',
      });
    }).toThrow();
  });

  it('should use default base URL when not provided', () => {
    const client = new Authlane({
      apiKey: 'test_api_key',
    });

    // Access private field for testing
    expect((client as any).baseUrl).toBe('https://api.authlane.com');
  });

  it('should use custom base URL when provided', () => {
    const client = new Authlane({
      apiKey: 'test_api_key',
      baseUrl: 'http://localhost:3000',
    });

    expect((client as any).baseUrl).toBe('http://localhost:3000');
  });

  it('should use default timeout when not provided', () => {
    const client = new Authlane({
      apiKey: 'test_api_key',
    });

    expect((client as any).timeout).toBe(30000);
  });

  it('should use custom timeout when provided', () => {
    const client = new Authlane({
      apiKey: 'test_api_key',
      timeout: 60000,
    });

    expect((client as any).timeout).toBe(60000);
  });
});

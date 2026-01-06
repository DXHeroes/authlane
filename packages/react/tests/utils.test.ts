/**
 * Tests for OAuth utilities
 */

import { describe, expect, it } from 'vitest';
import { generateAuthorizeUrl, parseOAuthCallback } from '../src/utils/oauth.js';

describe('OAuth utilities', () => {
  describe('generateAuthorizeUrl', () => {
    it('should generate basic authorize URL', () => {
      const url = generateAuthorizeUrl({
        baseUrl: 'https://api.authlane.com',
        userId: 'user_123',
        serviceId: 'github',
      });

      expect(url).toContain('https://api.authlane.com/api/v1/oauth/authorize');
      expect(url).toContain('user_id=user_123');
      expect(url).toContain('service_id=github');
    });

    it('should include redirect URL when provided', () => {
      const url = generateAuthorizeUrl({
        baseUrl: 'https://api.authlane.com',
        userId: 'user_123',
        serviceId: 'github',
        redirectUrl: 'https://myapp.com/callback',
      });

      expect(url).toContain('redirect_url=https%3A%2F%2Fmyapp.com%2Fcallback');
    });

    it('should include scopes when provided', () => {
      const url = generateAuthorizeUrl({
        baseUrl: 'https://api.authlane.com',
        userId: 'user_123',
        serviceId: 'github',
        scopes: ['repo', 'user:email'],
      });

      expect(url).toContain('scopes=repo%2Cuser%3Aemail');
    });
  });

  describe('parseOAuthCallback', () => {
    it('should parse successful callback', () => {
      // Mock window.location
      const mockSearch = '?user_id=user_123&service_id=github&success=true';
      Object.defineProperty(window, 'location', {
        value: { search: mockSearch },
        writable: true,
      });

      const result = parseOAuthCallback();

      expect(result).toEqual({
        userId: 'user_123',
        serviceId: 'github',
        success: true,
        error: undefined,
      });
    });

    it('should parse error callback', () => {
      const mockSearch = '?user_id=user_123&service_id=github&success=false&error=access_denied';
      Object.defineProperty(window, 'location', {
        value: { search: mockSearch },
        writable: true,
      });

      const result = parseOAuthCallback();

      expect(result).toEqual({
        userId: 'user_123',
        serviceId: 'github',
        success: false,
        error: 'access_denied',
      });
    });

    it('should return null for invalid callback', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?foo=bar' },
        writable: true,
      });

      const result = parseOAuthCallback();

      expect(result).toBeNull();
    });
  });
});

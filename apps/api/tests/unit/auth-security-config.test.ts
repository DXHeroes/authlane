import { afterEach, describe, expect, it } from 'vitest';
import {
  authModeConfiguration,
  isSignUpEnabled,
  parseAuthMode,
  parseAuthSecrets,
  validateMagicLinkEmailConfiguration,
  validateTrustedOrigins,
} from '../../src/lib/auth-security-config.js';

describe('authentication security configuration', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('parses current and previous Better Auth secrets in rotation order', () => {
    expect(parseAuthSecrets(`2:${'a'.repeat(32)},1:${'b'.repeat(32)}`, 'production')).toEqual([
      { version: 2, value: 'a'.repeat(32) },
      { version: 1, value: 'b'.repeat(32) },
    ]);
  });

  it('rejects missing, duplicate, or weak production auth secrets', () => {
    expect(() => parseAuthSecrets(undefined, 'production')).toThrow(/BETTER_AUTH_SECRETS/);
    expect(() => parseAuthSecrets('1:short', 'production')).toThrow(/32 characters/);
    expect(() => parseAuthSecrets(`1:${'a'.repeat(32)},1:${'b'.repeat(32)}`, 'production')).toThrow(
      /duplicate/
    );
  });

  it('requires exact HTTPS origins outside local development', () => {
    expect(validateTrustedOrigins(['https://dashboard.authlane.dev'], 'production')).toEqual([
      'https://dashboard.authlane.dev',
    ]);
    expect(() => validateTrustedOrigins(['*'], 'production')).toThrow(/exact/);
    expect(() => validateTrustedOrigins(['http://localhost:5173'], 'production')).toThrow(/HTTPS/);
    expect(() => validateTrustedOrigins(['https://app.example.com/path'], 'production')).toThrow(
      /origin/
    );
  });

  it('keeps sign-up open in development and closed by default in production', () => {
    expect(isSignUpEnabled(undefined, 'development')).toBe(true);
    expect(isSignUpEnabled(undefined, 'production')).toBe(false);
    expect(isSignUpEnabled('true', 'production')).toBe(true);
    expect(isSignUpEnabled('false', 'development')).toBe(false);
    expect(() => isSignUpEnabled('yes', 'production')).toThrow(/true or false/);
  });

  it('supports explicit passwordless and password authentication modes', () => {
    expect(parseAuthMode(undefined)).toBe('email-password');
    expect(parseAuthMode(' magic-link ')).toBe('magic-link');
    expect(parseAuthMode('email-password')).toBe('email-password');
    expect(() => parseAuthMode('password')).toThrow(/AUTHLANE_AUTH_MODE/);
  });

  it('requires complete email delivery configuration for production magic links', () => {
    expect(() =>
      validateMagicLinkEmailConfiguration({
        authMode: 'magic-link',
        environment: 'production',
        resendApiKey: undefined,
        emailFrom: 'Authlane <auth@mail.authlane.io>',
      })
    ).toThrow(/RESEND_API_KEY/);
    expect(() =>
      validateMagicLinkEmailConfiguration({
        authMode: 'magic-link',
        environment: 'production',
        resendApiKey: 'runtime-secret',
        emailFrom: undefined,
      })
    ).toThrow(/EMAIL_FROM/);
    expect(() =>
      validateMagicLinkEmailConfiguration({
        authMode: 'magic-link',
        environment: 'production',
        resendApiKey: 'runtime-secret',
        emailFrom: 'Authlane <auth@mail.authlane.io>',
      })
    ).not.toThrow();
    expect(() =>
      validateMagicLinkEmailConfiguration({
        authMode: 'email-password',
        environment: 'production',
      })
    ).not.toThrow();
  });

  it('locks magic links to hashed, single-use, ten-minute tokens', () => {
    expect(authModeConfiguration('magic-link', true)).toEqual({
      emailAndPasswordEnabled: false,
      twoFactorEnabled: false,
      magicLink: {
        disableSignUp: false,
        expiresIn: 600,
        storeToken: 'hashed',
      },
    });
    expect(authModeConfiguration('email-password', false)).toEqual({
      emailAndPasswordEnabled: true,
      twoFactorEnabled: true,
      magicLink: null,
    });
  });
});

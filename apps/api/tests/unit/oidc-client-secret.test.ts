/**
 * The sealed storage format for OAuth client secrets.
 *
 * Whatever registers a client writes this format and the token endpoint reads it back, so a change
 * that only looks cosmetic — the prefix, the field list, the encoding — locks every existing client
 * out of token exchange.
 */

import { decryptOAuthClientSecret, encryptOAuthClientSecret } from '@authlane/crypto';
import { describe, expect, it } from 'vitest';

const SECRET = 'smartstaff-client-secret-value';

describe('OAuth client secret envelope', () => {
  it('round-trips a secret through the data KEK ring', async () => {
    const sealed = await encryptOAuthClientSecret(SECRET);

    expect(sealed).not.toContain(SECRET);
    expect(sealed).toMatch(/^authlane\.oidc\.v1\./);
    expect(await decryptOAuthClientSecret(sealed)).toBe(SECRET);
  });

  it('seals the same secret differently every time', async () => {
    const first = await encryptOAuthClientSecret(SECRET);
    const second = await encryptOAuthClientSecret(SECRET);

    expect(first).not.toBe(second);
    expect(await decryptOAuthClientSecret(second)).toBe(SECRET);
  });

  it('round-trips a secret containing multi-byte characters', async () => {
    const unicode = 'přísně-tajné-🔐';

    expect(await decryptOAuthClientSecret(await encryptOAuthClientSecret(unicode))).toBe(unicode);
  });

  it('refuses a value that is not in the envelope format', async () => {
    await expect(decryptOAuthClientSecret(SECRET)).rejects.toThrow(
      'not in the expected envelope format'
    );
  });

  it('refuses an envelope whose body is not JSON', async () => {
    const sealed = `authlane.oidc.v1.${Buffer.from('not json', 'utf8').toString('base64url')}`;

    await expect(decryptOAuthClientSecret(sealed)).rejects.toThrow('not valid JSON');
  });

  it('refuses an envelope that is missing fields', async () => {
    const sealed = `authlane.oidc.v1.${Buffer.from(
      JSON.stringify({ keyId: 'test-kek', ciphertext: 'x' }),
      'utf8'
    ).toString('base64url')}`;

    await expect(decryptOAuthClientSecret(sealed)).rejects.toThrow('missing required fields');
  });

  it('refuses an envelope whose ciphertext has been tampered with', async () => {
    const sealed = await encryptOAuthClientSecret(SECRET);
    const envelope = JSON.parse(
      Buffer.from(sealed.replace('authlane.oidc.v1.', ''), 'base64url').toString('utf8')
    );
    envelope.ciphertext = Buffer.from('tampered', 'utf8').toString('base64');
    const tampered = `authlane.oidc.v1.${Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url')}`;

    await expect(decryptOAuthClientSecret(tampered)).rejects.toThrow();
  });
});

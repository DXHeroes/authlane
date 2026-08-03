import { describe, expect, it } from 'vitest';
import {
  EnvelopeSecretVault,
  type Keyring,
  parseKeyring,
  type SealedSecret,
} from '../src/index.js';

const firstKey = '11'.repeat(32);
const secondKey = '22'.repeat(32);

function keyring(currentKeyId = 'kek-2026-07'): Keyring {
  return {
    currentKeyId,
    keys: new Map([
      ['kek-2026-07', Buffer.from(firstKey, 'hex')],
      ['kek-2026-08', Buffer.from(secondKey, 'hex')],
    ]),
  };
}

const context = {
  id: 'secret_1',
  organizationId: 'org_1',
  purpose: 'connection_credentials',
} as const;

describe('versioned keyrings', () => {
  it('uses the first entry as the current key and retains older versions for reads', () => {
    const ring = parseKeyring(`kek-2026-08:${secondKey},kek-2026-07:${firstKey}`);

    expect(ring.currentKeyId).toBe('kek-2026-08');
    expect(ring.keys.get('kek-2026-07')?.toString('hex')).toBe(firstKey);
  });

  it.each([
    '',
    `bad key:${firstKey}`,
    `duplicate:${firstKey},duplicate:${secondKey}`,
    'kek-2026-07:not-hex',
  ])('rejects an invalid keyring: %s', (value) => {
    expect(() => parseKeyring(value)).toThrow();
  });
});

describe('per-record envelope secret vault', () => {
  it('seals and opens secret bytes with separate payload and DEK nonces', async () => {
    const vault = new EnvelopeSecretVault(keyring());
    const sealed = await vault.seal({ ...context, plaintext: Buffer.from('refresh-secret') });

    expect(sealed.keyId).toBe('kek-2026-07');
    expect(sealed.payloadIv).not.toBe(sealed.wrappedDekIv);
    await expect(vault.open(sealed, context)).resolves.toEqual(Buffer.from('refresh-secret'));
  });

  it.each(['organizationId', 'id', 'purpose'] as const)(
    'rejects AAD substitution of %s',
    async (field) => {
      const vault = new EnvelopeSecretVault(keyring());
      const sealed = await vault.seal({ ...context, plaintext: Buffer.from('access-secret') });
      const substituted = { ...context, [field]: `${context[field]}_other` };

      await expect(vault.open(sealed, substituted)).rejects.toThrow();
    }
  );

  it.each(['ciphertext', 'payloadTag', 'wrappedDek', 'wrappedDekTag'] as const)(
    'rejects tampering with %s',
    async (field) => {
      const vault = new EnvelopeSecretVault(keyring());
      const sealed = await vault.seal({ ...context, plaintext: Buffer.from('access-secret') });
      const tampered: SealedSecret = {
        ...sealed,
        [field]: `${sealed[field].slice(0, -2)}AA`,
      };

      await expect(vault.open(tampered, context)).rejects.toThrow();
    }
  );

  it('rewraps only the DEK under the current KEK during rotation', async () => {
    const oldVault = new EnvelopeSecretVault(keyring('kek-2026-07'));
    const sealed = await oldVault.seal({ ...context, plaintext: Buffer.from('rotating-secret') });
    const newVault = new EnvelopeSecretVault(keyring('kek-2026-08'));
    const rewrapped = await newVault.rewrap(sealed, context);

    expect(rewrapped.keyId).toBe('kek-2026-08');
    expect(rewrapped.ciphertext).toBe(sealed.ciphertext);
    expect(rewrapped.payloadIv).toBe(sealed.payloadIv);
    expect(rewrapped.payloadTag).toBe(sealed.payloadTag);
    expect(rewrapped.wrappedDek).not.toBe(sealed.wrappedDek);
    await expect(newVault.open(rewrapped, context)).resolves.toEqual(
      Buffer.from('rotating-secret')
    );
  });

  it('cannot open a record when the referenced KEK is missing', async () => {
    const oldVault = new EnvelopeSecretVault(keyring('kek-2026-07'));
    const sealed = await oldVault.seal({ ...context, plaintext: Buffer.from('secret') });
    const newOnlyRing: Keyring = {
      currentKeyId: 'kek-2026-08',
      keys: new Map([['kek-2026-08', Buffer.from(secondKey, 'hex')]]),
    };

    await expect(new EnvelopeSecretVault(newOnlyRing).open(sealed, context)).rejects.toThrow(
      /Unknown key version/
    );
  });
});

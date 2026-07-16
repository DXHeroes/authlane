import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Keyring } from './keyring.js';

const ALGORITHM = 'aes-256-gcm';
const DEK_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const AAD_VERSION = 1;

export interface SecretContext {
  id: string;
  organizationId: string;
  purpose: string;
}

export interface SealSecretInput extends SecretContext {
  plaintext: Uint8Array;
}

export interface SealedSecret extends SecretContext {
  keyId: string;
  wrappedDek: string;
  wrappedDekIv: string;
  wrappedDekTag: string;
  ciphertext: string;
  payloadIv: string;
  payloadTag: string;
  aadVersion: number;
}

export interface SecretVault {
  seal(input: SealSecretInput): Promise<SealedSecret>;
  open(record: SealedSecret, expected: SecretContext): Promise<Buffer>;
  rewrap(record: SealedSecret, expected: SecretContext): Promise<SealedSecret>;
}

interface CiphertextParts {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

function canonicalAad(context: SecretContext, kind: 'payload' | 'dek'): Buffer {
  return Buffer.from(
    JSON.stringify([
      'authlane.secret',
      AAD_VERSION,
      kind,
      context.organizationId,
      context.id,
      context.purpose,
    ]),
    'utf8'
  );
}

function encryptAead(plaintext: Uint8Array, key: Buffer, aad: Buffer): CiphertextParts {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function decryptAead(parts: CiphertextParts, key: Buffer, aad: Buffer): Buffer {
  if (parts.iv.length !== IV_LENGTH || parts.tag.length !== TAG_LENGTH) {
    throw new Error('Invalid envelope nonce or authentication tag length');
  }
  const decipher = createDecipheriv(ALGORITHM, key, parts.iv, { authTagLength: TAG_LENGTH });
  decipher.setAAD(aad);
  decipher.setAuthTag(parts.tag);
  return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]);
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('Invalid base64 envelope field');
  }
  return Buffer.from(value, 'base64');
}

function encoded(parts: CiphertextParts) {
  return {
    ciphertext: parts.ciphertext.toString('base64'),
    iv: parts.iv.toString('base64'),
    tag: parts.tag.toString('base64'),
  };
}

function assertContext(record: SealedSecret, expected: SecretContext): void {
  if (
    record.aadVersion !== AAD_VERSION ||
    record.id !== expected.id ||
    record.organizationId !== expected.organizationId ||
    record.purpose !== expected.purpose
  ) {
    throw new Error('Secret context does not match its authenticated envelope');
  }
}

export class EnvelopeSecretVault implements SecretVault {
  constructor(private readonly keyring: Keyring) {
    const current = keyring.keys.get(keyring.currentKeyId);
    if (!current || current.length !== DEK_LENGTH) {
      throw new Error('Keyring current key must be exactly 32 bytes');
    }
  }

  async seal(input: SealSecretInput): Promise<SealedSecret> {
    const kek = this.requireKey(this.keyring.currentKeyId);
    const dek = randomBytes(DEK_LENGTH);
    try {
      const payload = encoded(encryptAead(input.plaintext, dek, canonicalAad(input, 'payload')));
      const wrapped = encoded(encryptAead(dek, kek, canonicalAad(input, 'dek')));
      return {
        id: input.id,
        organizationId: input.organizationId,
        purpose: input.purpose,
        keyId: this.keyring.currentKeyId,
        wrappedDek: wrapped.ciphertext,
        wrappedDekIv: wrapped.iv,
        wrappedDekTag: wrapped.tag,
        ciphertext: payload.ciphertext,
        payloadIv: payload.iv,
        payloadTag: payload.tag,
        aadVersion: AAD_VERSION,
      };
    } finally {
      dek.fill(0);
    }
  }

  async open(record: SealedSecret, expected: SecretContext): Promise<Buffer> {
    assertContext(record, expected);
    const dek = this.unwrapDek(record, expected);
    try {
      return decryptAead(
        {
          ciphertext: decode(record.ciphertext),
          iv: decode(record.payloadIv),
          tag: decode(record.payloadTag),
        },
        dek,
        canonicalAad(expected, 'payload')
      );
    } finally {
      dek.fill(0);
    }
  }

  async rewrap(record: SealedSecret, expected: SecretContext): Promise<SealedSecret> {
    assertContext(record, expected);
    if (record.keyId === this.keyring.currentKeyId) return { ...record };

    const dek = this.unwrapDek(record, expected);
    try {
      const wrapped = encoded(
        encryptAead(dek, this.requireKey(this.keyring.currentKeyId), canonicalAad(expected, 'dek'))
      );
      return {
        ...record,
        keyId: this.keyring.currentKeyId,
        wrappedDek: wrapped.ciphertext,
        wrappedDekIv: wrapped.iv,
        wrappedDekTag: wrapped.tag,
      };
    } finally {
      dek.fill(0);
    }
  }

  private unwrapDek(record: SealedSecret, context: SecretContext): Buffer {
    const dek = decryptAead(
      {
        ciphertext: decode(record.wrappedDek),
        iv: decode(record.wrappedDekIv),
        tag: decode(record.wrappedDekTag),
      },
      this.requireKey(record.keyId),
      canonicalAad(context, 'dek')
    );
    if (dek.length !== DEK_LENGTH) {
      dek.fill(0);
      throw new Error('Invalid wrapped data encryption key');
    }
    return dek;
  }

  private requireKey(keyId: string): Buffer {
    const key = this.keyring.keys.get(keyId);
    if (!key || key.length !== DEK_LENGTH) throw new Error(`Unknown key version: ${keyId}`);
    return key;
  }
}

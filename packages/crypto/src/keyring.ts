export interface Keyring {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEY_HEX = /^[0-9a-fA-F]{64}$/;

export function parseKeyring(value: string): Keyring {
  if (!value) throw new Error('Keyring must contain at least one versioned key');

  const keys = new Map<string, Buffer>();
  let currentKeyId: string | undefined;
  for (const rawEntry of value.split(',')) {
    const separator = rawEntry.indexOf(':');
    const keyId = rawEntry.slice(0, separator);
    const keyHex = rawEntry.slice(separator + 1);
    if (separator <= 0 || !KEY_ID.test(keyId) || !KEY_HEX.test(keyHex)) {
      throw new Error(
        'Invalid keyring entry. Expected key-id followed by a 32-byte hexadecimal key'
      );
    }
    if (keys.has(keyId)) throw new Error(`Duplicate key version: ${keyId}`);
    currentKeyId ??= keyId;
    keys.set(keyId, Buffer.from(keyHex, 'hex'));
  }

  if (!currentKeyId || keys.size === 0) {
    throw new Error('Keyring must contain at least one versioned key');
  }
  return { currentKeyId, keys };
}

export function keyringFromEnvironment(name: string): Keyring {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required. Generate a key with: openssl rand -hex 32 and prefix it with a version`
    );
  }
  return parseKeyring(value);
}

export function getDataKekKeyring(): Keyring {
  return keyringFromEnvironment('AUTHLANE_DATA_KEK_RING');
}

export function getLookupKeyring(): Keyring {
  return keyringFromEnvironment('AUTHLANE_LOOKUP_KEY_RING');
}

export function getRedisKeyring(): Keyring {
  return keyringFromEnvironment('AUTHLANE_REDIS_KEY_RING');
}

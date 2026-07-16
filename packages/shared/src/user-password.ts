import { Algorithm, hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcrypt';

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

/** Hashes an interactive user password using memory-hard Argon2id. */
export async function hashUserPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Verifies Argon2id hashes and legacy bcrypt hashes during migration. */
export async function verifyUserPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    if (passwordHash.startsWith('$argon2id$')) {
      return await verify(passwordHash, password);
    }
    if (/^\$2[aby]\$/.test(passwordHash)) {
      return await bcrypt.compare(password, passwordHash);
    }
    return false;
  } catch {
    return false;
  }
}

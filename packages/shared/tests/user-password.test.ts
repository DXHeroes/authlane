import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { hashUserPassword, verifyUserPassword } from '../src/user-password.js';

describe('user password hashing', () => {
  it('creates and verifies an Argon2id password hash', async () => {
    const hash = await hashUserPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyUserPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyUserPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('continues to verify legacy bcrypt hashes during migration', async () => {
    const legacyHash = await bcrypt.hash('legacy password', 10);

    await expect(verifyUserPassword('legacy password', legacyHash)).resolves.toBe(true);
    await expect(verifyUserPassword('wrong password', legacyHash)).resolves.toBe(false);
  });

  it('fails closed for unrecognized or malformed hashes', async () => {
    await expect(verifyUserPassword('password', 'not-a-password-hash')).resolves.toBe(false);
    await expect(verifyUserPassword('password', '$argon2id$broken')).resolves.toBe(false);
  });
});

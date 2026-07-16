import { Authlane } from '@authlane/sdk';

const apiKey = process.env.AUTHLANE_API_KEY;
if (!apiKey) throw new Error('AUTHLANE_API_KEY is required');

const authlane = new Authlane({
  apiKey,
  baseUrl: process.env.AUTHLANE_BASE_URL ?? 'http://localhost:3000',
});

const externalUserId = 'user_123';
const { data: capabilities, error } = await authlane.capabilities.get({
  externalUserId,
  format: 'mcp',
});

if (error) {
  console.error(error.code, error.message);
  process.exitCode = 1;
} else {
  console.log(capabilities);
}

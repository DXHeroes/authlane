import { vercelAI } from '@authlane/ai/vercel';
import { Authlane } from '@authlane/sdk';

const apiKey = process.env.AUTHLANE_API_KEY;
const externalUserId = process.env.AUTHLANE_EXTERNAL_USER_ID;

if (!apiKey) throw new Error('AUTHLANE_API_KEY is required');
if (!externalUserId) {
  throw new Error('AUTHLANE_EXTERNAL_USER_ID must come from a trusted server session');
}

const authlane = new Authlane({
  apiKey,
  baseUrl: process.env.AUTHLANE_BASE_URL ?? 'https://app.authlane.io',
});
const user = authlane.user(externalUserId);
const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });

if (error) {
  console.error(error.code, error.message);
  process.exitCode = 1;
} else {
  // Pass `tools` directly to server-side streamText(). Do not log, serialize,
  // return to a browser, or cache this executable user-bound toolset.
  console.log(`Loaded ${Object.keys(tools).length} server-side tools for this request.`);
}

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const quickstartUrl = new URL('../apps/docs/quickstart.mdx', import.meta.url);

describe('AI quickstart request boundary', () => {
  it('documents bounded UTF-8 parsing and strict message validation before streamText', async () => {
    const quickstart = await readFile(quickstartUrl, 'utf8');
    const aiRoute = quickstart.slice(quickstart.indexOf('## 5. Give the model'));

    expect(aiRoute).toContain("import { z } from 'zod';");
    expect(aiRoute).toContain("request.headers.get('content-length')");
    expect(aiRoute).toContain('receivedBytes += value.byteLength');
    expect(aiRoute).toContain('receivedBytes > MAX_CHAT_REQUEST_BYTES');
    expect(aiRoute).toContain("new TextDecoder('utf-8', { fatal: true })");
    expect(aiRoute).toContain('.max(MAX_CHAT_MESSAGES)');
    expect(aiRoute).toContain('.max(MAX_CHAT_MESSAGE_CHARACTERS)');
    expect(aiRoute).toContain('.strict()');
    expect(aiRoute).toContain("code: 'INVALID_CHAT_REQUEST'");

    const postRoute = aiRoute.slice(aiRoute.indexOf('export async function POST'));
    expect(postRoute.indexOf('requireUser(request)')).toBeLessThan(
      postRoute.indexOf('readChatRequest(request)')
    );
    expect(postRoute.indexOf('readChatRequest(request)')).toBeLessThan(
      postRoute.indexOf('streamText({')
    );
    expect(postRoute).not.toContain('error.message');
  });
});

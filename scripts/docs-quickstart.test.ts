import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const quickstartUrl = new URL('../apps/docs/quickstart.mdx', import.meta.url);
const oauthGuideUrl = new URL('../apps/docs/guides/oauth-setup.mdx', import.meta.url);
const typescriptSdkUrl = new URL('../apps/docs/sdk/typescript.mdx', import.meta.url);

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

  it('keeps TypeScript SDK examples on explicit data and error bindings', async () => {
    const sdk = await readFile(typescriptSdkUrl, 'utf8');

    expect(sdk).toContain('const { data: capabilities, error: capabilitiesError } =');
    expect(sdk).toContain('const { data: connections, error: connectionsError } =');
    expect(sdk).toContain('const { data: definitions, error: definitionsError } =');
    expect(sdk).toContain('const { data: customTools, error: customToolsError } =');
    expect(sdk).toContain('const { data: session, error: sessionError } =');
    expect(sdk).toContain('const { data: services, error: servicesError } =');
    expect(sdk).toContain('const { data: rawDefinitions, error: definitionsError } =');
    expect(sdk).not.toMatch(
      /const (?:capabilities|connections|definitions|result|session) = await (?:authlane|user\.)/
    );
    expect(sdk).not.toMatch(/^await authlane\./m);
  });

  it('initializes Authlane and handles the connect-session error in the OAuth guide', async () => {
    const guide = await readFile(oauthGuideUrl, 'utf8');

    expect(guide).toContain("import { Authlane } from '@authlane/sdk';");
    expect(guide).toContain('const authlane = new Authlane({');
    expect(guide).toContain('const { data, error } = await authlane.connectSessions.create({');
    expect(guide).toContain('if (error) {');
    expect(guide.indexOf('new Authlane({')).toBeLessThan(
      guide.indexOf('authlane.connectSessions.create({')
    );
  });
});

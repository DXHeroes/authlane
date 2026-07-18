import { Authlane } from '@authlane/sdk';
import type { CredentialMaterial, IntegrationAdapter } from '@authlane/shared';
import { describe, expect, it, vi } from 'vitest';
import { mastraAI } from '../src/mastra.js';

const githubTool = {
  name: 'github_create_issue',
  description: 'Create a GitHub issue.',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
    additionalProperties: false,
  },
};

const slackTool = {
  name: 'slack_send_message',
  description: 'Send a Slack message.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
};

function response(data: unknown) {
  return new Response(JSON.stringify({ data, error: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Mastra user-scoped SDK flow', () => {
  it('builds connected tools and leases only for valid local execution under the bound user', async () => {
    const externalUserId = 'tenant-user_123';
    const credentialSecret = 'provider-access-token-secret';
    const localExecutions: Array<{
      toolName: string;
      input: Record<string, unknown>;
      credential: CredentialMaterial;
    }> = [];
    const localExecute = vi.fn<IntegrationAdapter['execute']>(
      async (toolName, input, credential) => {
        localExecutions.push({ toolName, input, credential });
        return { data: { externalUserId, serviceId: 'github', toolName, input }, error: null };
      }
    );
    const callerOwnedGithub: IntegrationAdapter = {
      serviceId: 'github',
      definitions: [],
      execute: localExecute,
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/${externalUserId}/capabilities?format=mcp`)) {
        expect(init?.method).toBeUndefined();
        return response({
          externalUserId,
          format: 'mcp',
          version: 'version-1',
          services: [
            {
              serviceId: 'github',
              status: 'connected',
              connected: true,
              expiresAt: null,
              tools: [githubTool],
            },
            {
              serviceId: 'slack',
              status: 'disconnected',
              connected: false,
              expiresAt: null,
              tools: [slackTool],
            },
          ],
        });
      }
      if (url.endsWith(`/${externalUserId}/connections/github/credential-leases`)) {
        expect(init?.method).toBe('POST');
        return response({
          type: 'oauth2',
          leaseId: 'lease-1',
          accessToken: credentialSecret,
          tokenType: 'Bearer',
          scopes: ['repo'],
          expiresAt: '2026-07-18T12:00:00.000Z',
        });
      }
      throw new Error(`Unexpected Authlane request: ${url}`);
    });
    const authlane = new Authlane({
      apiKey: 'ak_server_secret',
      baseUrl: 'https://authlane.test',
      fetch: fetchFn as typeof fetch,
    });

    const listed = await authlane
      .user(externalUserId)
      .tools.list({ adapter: mastraAI({ integrations: [callerOwnedGithub] }) });

    expect(listed.error).toBeNull();
    expect(Object.keys(listed.data ?? {})).toEqual(['github_create_issue']);
    expect(listed.data).not.toHaveProperty('slack_send_message');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(localExecute).not.toHaveBeenCalled();

    const invalidResult = await listed.data?.github_create_issue.execute({});
    expect(invalidResult).toEqual({
      error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(localExecute).not.toHaveBeenCalled();

    const toolInput = { title: 'Ship canonical contracts' };
    const validResult = await listed.data?.github_create_issue.execute(toolInput);

    expect(validResult).toEqual({
      externalUserId,
      serviceId: 'github',
      toolName: 'github_create_issue',
      input: toolInput,
    });
    expect(JSON.stringify(validResult)).not.toContain(credentialSecret);
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      `https://authlane.test/api/v1/users/${externalUserId}/capabilities?format=mcp`,
      `https://authlane.test/api/v1/users/${externalUserId}/connections/github/credential-leases`,
    ]);
    expect(localExecute).toHaveBeenCalledOnce();
    expect(localExecutions).toEqual([
      {
        toolName: 'github_create_issue',
        input: toolInput,
        credential: {
          type: 'oauth2',
          accessToken: credentialSecret,
          tokenType: 'Bearer',
          scopes: ['repo'],
          expiresAt: '2026-07-18T12:00:00.000Z',
        },
      },
    ]);
  });
});

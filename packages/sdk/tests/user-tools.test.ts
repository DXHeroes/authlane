import { describe, expect, it, vi } from 'vitest';
import {
  Authlane,
  type AuthlaneError,
  type CredentialLease,
  type Result,
  type UserToolAdapter,
  type UserToolDefinition,
} from '../src/index.js';

type BuiltTools = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

const githubTool = {
  name: 'github_create_issue',
  description: 'Create a GitHub issue',
  inputSchema: { type: 'object' },
};
const slackTool = {
  name: 'slack_send_message',
  description: 'Send a Slack message',
  inputSchema: { type: 'object' },
};
const credential: CredentialLease = {
  type: 'oauth2',
  leaseId: 'lease-1',
  accessToken: 'provider-access-token-secret',
  tokenType: 'Bearer',
  scopes: ['repo'],
  expiresAt: '2026-07-18T12:00:00.000Z',
};

const capabilities = {
  externalUserId: 'user_123',
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
    {
      serviceId: 'linear',
      status: 'expired',
      connected: false,
      expiresAt: '2026-07-17T12:00:00.000Z',
      tools: [{ ...githubTool, name: 'linear_create_issue' }],
    },
    {
      serviceId: 'sentry',
      status: 'error',
      connected: false,
      expiresAt: null,
      tools: [{ ...githubTool, name: 'sentry_get_issue' }],
    },
  ],
};

function response(data: unknown, error: unknown = null, status = 200) {
  return new Response(JSON.stringify({ data, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createClient(fetchFn: typeof fetch) {
  return new Authlane({
    apiKey: 'ak_server_secret',
    baseUrl: 'https://authlane.test',
    fetch: fetchFn,
  });
}

function createAdapter(events: string[] = []) {
  const buildContexts: Array<{
    externalUserId: string;
    tools: UserToolDefinition[];
    execute: (
      serviceId: string,
      toolName: string,
      input: Record<string, unknown>
    ) => Promise<unknown>;
  }> = [];
  const execute = vi.fn(
    async (input: {
      externalUserId: string;
      serviceId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      credential: CredentialLease;
    }): Promise<Result<unknown>> => {
      events.push('adapter.execute');
      return { data: { ok: true, input }, error: null };
    }
  );
  const adapter: UserToolAdapter<BuiltTools> = {
    format: 'mcp',
    build: (context) => {
      events.push('adapter.build');
      buildContexts.push(context);
      return Object.fromEntries(
        context.tools.map((tool) => [
          tool.name,
          (input: Record<string, unknown>) => context.execute(tool.serviceId, tool.name, input),
        ])
      );
    },
    execute,
  };
  return { adapter, buildContexts, execute };
}

describe('user tool adapter contract', () => {
  it('builds only connected tools and leases a credential only when an allowed tool runs', async () => {
    const events: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) {
        events.push('capabilities');
        expect(init?.method).toBeUndefined();
        return response(capabilities);
      }
      if (url.endsWith('/connections/github/credential-leases')) {
        events.push('lease');
        expect(init?.method).toBe('POST');
        return response(credential);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const { adapter, buildContexts, execute } = createAdapter(events);

    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(listed.error).toBeNull();
    expect(Object.keys(listed.data ?? {})).toEqual(['github_create_issue']);
    expect(buildContexts).toHaveLength(1);
    expect(buildContexts[0]).toMatchObject({
      externalUserId: 'user_123',
      tools: [{ ...githubTool, serviceId: 'github' }],
    });
    expect(buildContexts[0]).not.toHaveProperty('apiKey');
    expect(buildContexts[0]).not.toHaveProperty('credential');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['capabilities', 'adapter.build']);

    const arguments_ = { owner: 'authlane', title: 'Adapter contract' };
    const execution = await listed.data?.github_create_issue(arguments_);

    expect(execution).toEqual({
      ok: true,
      input: {
        externalUserId: 'user_123',
        serviceId: 'github',
        toolName: 'github_create_issue',
        arguments: arguments_,
        credential,
      },
    });
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      'https://authlane.test/api/v1/users/user_123/capabilities?format=mcp',
      'https://authlane.test/api/v1/users/user_123/connections/github/credential-leases',
    ]);
    expect(execute).toHaveBeenCalledWith({
      externalUserId: 'user_123',
      serviceId: 'github',
      toolName: 'github_create_issue',
      arguments: arguments_,
      credential,
    });
    expect(events).toEqual(['capabilities', 'adapter.build', 'lease', 'adapter.execute']);
  });

  it('does not cache credential leases between allowed invocations', async () => {
    let leaseNumber = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return response(capabilities);
      if (url.endsWith('/credential-leases')) {
        leaseNumber += 1;
        return response({ ...credential, leaseId: `lease-${leaseNumber}` });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const { adapter, execute } = createAdapter();
    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    await listed.data?.github_create_issue({ invocation: 1 });
    await listed.data?.github_create_issue({ invocation: 2 });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls.map(([input]) => input.credential.leaseId)).toEqual([
      'lease-1',
      'lease-2',
    ]);
  });

  it('blocks an eager execute call made synchronously during adapter build', async () => {
    let eagerExecution: Promise<unknown> | undefined;
    const execute = vi.fn(
      async (): Promise<Result<unknown>> => ({
        data: { shouldNotRun: true },
        error: null,
      })
    );
    const adapter: UserToolAdapter<{ ready: true }> = {
      format: 'mcp',
      build: ({ execute: guardedExecute }) => {
        eagerExecution = guardedExecute('github', 'github_create_issue', { eager: true });
        return { ready: true };
      },
      execute,
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return response(capabilities);
      throw new Error(`Unexpected request: ${url}`);
    });

    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(listed).toEqual({ data: { ready: true }, error: null });
    expect(await eagerExecution).toEqual({
      error: {
        code: 'TOOL_NOT_AVAILABLE',
        message: 'Tool execution is not available during adapter build.',
      },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown service', 'not-github', 'github_create_issue'],
    ['unknown tool', 'github', 'github_delete_repository'],
    ['tampered cross-service pair', 'slack', 'github_create_issue'],
  ])('rejects an %s pair from the capability snapshot before leasing', async (_case, serviceId, toolName) => {
    let invokeTampered: (() => Promise<unknown>) | undefined;
    const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
    const adapter: UserToolAdapter<{ invoke: () => Promise<unknown> }> = {
      format: 'mcp',
      build: ({ execute: guardedExecute }) => {
        invokeTampered = () => guardedExecute(serviceId, toolName, { tampered: true });
        return { invoke: () => invokeTampered?.() };
      },
      execute,
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return response(capabilities);
      throw new Error(`Unexpected request: ${url}`);
    });
    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(await listed.data?.invoke()).toEqual({
      error: { code: 'TOOL_NOT_AVAILABLE', message: 'Tool is not available for this user.' },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'API error',
      async () =>
        response(
          null,
          {
            code: 'UNAUTHORIZED',
            message: 'Rejected with provider-access-token-secret',
            hint: 'credential=provider-access-token-secret',
            docUrl: 'https://secret.invalid/body',
          },
          401
        ),
    ],
    ['network failure', async () => Promise.reject(new Error('socket leaked-secret'))],
  ])('redacts a credential lease %s and never calls the adapter', async (_case, leaseResponse) => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return response(capabilities);
      if (url.endsWith('/credential-leases')) return leaseResponse();
      throw new Error(`Unexpected request: ${url}`);
    });
    const { adapter, execute } = createAdapter();
    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    const execution = await listed.data?.github_create_issue({ title: 'safe' });

    expect(execution).toEqual({
      error: {
        code: 'CREDENTIAL_LEASE_ERROR',
        message: 'Credential lease could not be issued.',
      },
    });
    expect(JSON.stringify(execution)).not.toMatch(/secret|hint|docUrl|stack|body/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it('turns an adapter build throw into a non-throwing SDK ADAPTER_ERROR', async () => {
    const adapter: UserToolAdapter<never> = {
      format: 'mcp',
      build: () => {
        throw new Error('build stack with provider-access-token-secret');
      },
      execute: vi.fn(),
    };
    const fetchFn = vi.fn(async () => response(capabilities));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result).toEqual({
      data: null,
      error: { code: 'ADAPTER_ERROR', message: 'Tool adapter failed to build.' },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|stack/i);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    'throw',
    'returned error',
  ] as const)('turns an adapter execute %s into a redacted non-throwing tool error', async (failureMode) => {
    const { adapter } = createAdapter();
    adapter.execute = vi.fn(async (): Promise<Result<unknown>> => {
      if (failureMode === 'throw') {
        throw new Error('provider-access-token-secret in stack');
      }
      const error: AuthlaneError = {
        code: 'PROVIDER_ERROR_WITH_SECRET',
        message: 'Provider returned provider-access-token-secret',
        hint: 'Authorization: Bearer provider-access-token-secret',
        docUrl: 'https://secret.invalid/provider-body',
      };
      return { data: null, error };
    });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return response(capabilities);
      if (url.endsWith('/credential-leases')) return response(credential);
      throw new Error(`Unexpected request: ${url}`);
    });
    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    const execution = await listed.data?.github_create_issue({ title: 'safe' });

    expect(execution).toEqual({
      error: { code: 'ADAPTER_ERROR', message: 'Tool execution failed.' },
    });
    expect(JSON.stringify(execution)).not.toMatch(/secret|hint|docUrl|stack|body/i);
  });

  it('short-circuits an invalid user scope before capabilities, build, or lease work', async () => {
    const fetchFn = vi.fn();
    const { adapter, execute } = createAdapter();
    const user = createClient(fetchFn as typeof fetch).user('');

    const validationResult = await user.connections.list();
    const result = await user.tools.list({ adapter });

    expect(result).toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid external user ID',
        statusCode: 400,
        hint: 'Provide a non-empty external user ID with no more than 255 characters.',
        docUrl: 'https://app.authlane.io/docs/sdk/typescript',
      },
    });
    expect(result.error).toBe(validationResult.error);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves definition-only list calls on the existing tools endpoint', async () => {
    const definitions = { tools: [githubTool], version: 'version-1' };
    const fetchFn = vi.fn(async () => response(definitions));
    const user = createClient(fetchFn as typeof fetch).user('user_123');

    const defaultResult = await user.tools.list();
    const formattedResult = await user.tools.list({ format: 'openai' });

    expect(defaultResult).toEqual({ data: definitions, error: null });
    expect(formattedResult).toEqual({ data: definitions, error: null });
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      'https://authlane.test/api/v1/users/user_123/tools?format=mcp',
      'https://authlane.test/api/v1/users/user_123/tools?format=openai',
    ]);
  });
});

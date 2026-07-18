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

function rawResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data, error: null }),
  } as Response;
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
    tools: readonly UserToolDefinition[];
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

  it('blocks an execute call scheduled with queueMicrotask during adapter build', async () => {
    let scheduledExecution: Promise<unknown> | undefined;
    const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
    const adapter: UserToolAdapter<{ ready: true }> = {
      format: 'mcp',
      build: ({ execute: guardedExecute }) => {
        queueMicrotask(() => {
          scheduledExecution = guardedExecute('github', 'github_create_issue', { eager: true });
        });
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
    await Promise.resolve();

    expect(listed).toEqual({ data: { ready: true }, error: null });
    expect(await scheduledExecution).toEqual({
      error: {
        code: 'TOOL_NOT_AVAILABLE',
        message: 'Tool execution is not available during adapter build.',
      },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks an execute call scheduled with Promise.then during adapter build', async () => {
    let scheduledExecution: Promise<unknown> | undefined;
    let continuationCompleted: (() => void) | undefined;
    const continuation = new Promise<void>((resolve) => {
      continuationCompleted = resolve;
    });
    const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
    const adapter: UserToolAdapter<{ ready: true }> = {
      format: 'mcp',
      build: ({ execute: guardedExecute }) => {
        void Promise.resolve().then(() => {
          scheduledExecution = guardedExecute('github', 'github_create_issue', { eager: true });
          continuationCompleted?.();
        });
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
    await continuation;

    expect(listed).toEqual({ data: { ready: true }, error: null });
    expect(await scheduledExecution).toEqual({
      error: {
        code: 'TOOL_NOT_AVAILABLE',
        message: 'Tool execution is not available during adapter build.',
      },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks an execute call scheduled with a timer during adapter build', async () => {
    let scheduledExecution: Promise<unknown> | undefined;
    let timerCompleted: (() => void) | undefined;
    const timer = new Promise<void>((resolve) => {
      timerCompleted = resolve;
    });
    const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
    const adapter: UserToolAdapter<{ ready: true }> = {
      format: 'mcp',
      build: ({ execute: guardedExecute }) => {
        setTimeout(() => {
          scheduledExecution = guardedExecute('github', 'github_create_issue', { eager: true });
          timerCompleted?.();
        }, 0);
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
    await timer;

    expect(listed).toEqual({ data: { ready: true }, error: null });
    expect(await scheduledExecution).toEqual({
      error: {
        code: 'TOOL_NOT_AVAILABLE',
        message: 'Tool execution is not available during adapter build.',
      },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an async adapter build result without returning data as a Promise', async () => {
    const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
    const adapter: UserToolAdapter<Promise<{ ready: true }>> = {
      format: 'mcp',
      build: async () => ({ ready: true }),
      execute,
    };
    const fetchFn = vi.fn(async () => response(capabilities));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'ADAPTER_ERROR', message: 'Tool adapter failed to build.' },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('absorbs a rejected async adapter build without an unhandled rejection', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
      const adapter: UserToolAdapter<Promise<never>> = {
        format: 'mcp',
        build: async () => {
          throw new Error('rejected build with provider-access-token-secret');
        },
        execute,
      };
      const fetchFn = vi.fn(async () => response(capabilities));

      const result = await createClient(fetchFn as typeof fetch)
        .user('user_123')
        .tools.list({ adapter });
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(result).toMatchObject({
        data: null,
        error: { code: 'ADAPTER_ERROR', message: 'Tool adapter failed to build.' },
      });
      expect(unhandledRejections).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('observes a rejected promise returned by a custom async then method', async () => {
    const secretError = new Error('async then leaked provider-access-token-secret');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      let thenCalls = 0;
      let buildOriginExecution: Promise<unknown> | undefined;
      const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
      const adapter: UserToolAdapter<{
        then(
          resolve: (value: { ready: true }) => void,
          reject: (reason: unknown) => void
        ): Promise<void>;
      }> = {
        format: 'mcp',
        build: ({ execute: guardedExecute }) => ({
          // biome-ignore lint/suspicious/noThenProperty: Exercises adversarial thenable observation.
          async then(resolve) {
            thenCalls += 1;
            buildOriginExecution = guardedExecute('github', 'github_create_issue', {
              eager: true,
            });
            resolve({ ready: true });
            throw secretError;
          },
        }),
        execute,
      };
      const fetchFn = vi.fn(async () => response(capabilities));

      const result = await createClient(fetchFn as typeof fetch)
        .user('user_123')
        .tools.list({ adapter });
      await Promise.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(result).toMatchObject({
        data: null,
        error: { code: 'ADAPTER_ERROR', message: 'Tool adapter failed to build.' },
      });
      expect(thenCalls).toBe(1);
      expect(await buildOriginExecution).toEqual({
        error: {
          code: 'TOOL_NOT_AVAILABLE',
          message: 'Tool execution is not available during adapter build.',
        },
      });
      expect(unhandledRejections).toEqual([]);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  const cyclicInputSchema: Record<string, unknown> = { type: 'object' };
  cyclicInputSchema.self = cyclicInputSchema;

  it.each([
    [
      'connected',
      () => {
        let reads = 0;
        const service = { ...capabilities.services[0] };
        Object.defineProperty(service, 'connected', {
          enumerable: true,
          get: () => {
            reads += 1;
            return reads === 1;
          },
        });
        return {
          capabilityData: { ...capabilities, services: [service] },
          getReads: () => reads,
        };
      },
    ],
    [
      'serviceId',
      () => {
        let reads = 0;
        const service = { ...capabilities.services[0] };
        Object.defineProperty(service, 'serviceId', {
          enumerable: true,
          get: () => {
            reads += 1;
            return reads <= 4 ? 'github' : 'slack';
          },
        });
        return {
          capabilityData: { ...capabilities, services: [service] },
          getReads: () => reads,
        };
      },
    ],
    [
      'tool name',
      () => {
        let reads = 0;
        const tool = { ...githubTool };
        Object.defineProperty(tool, 'name', {
          enumerable: true,
          get: () => {
            reads += 1;
            return reads <= 4 ? 'github_create_issue' : 'slack_send_message';
          },
        });
        return {
          capabilityData: {
            ...capabilities,
            services: [{ ...capabilities.services[0], tools: [tool] }],
          },
          getReads: () => reads,
        };
      },
    ],
  ])('rejects a changing %s accessor before adapter build', async (_case, createFixture) => {
    const { capabilityData, getReads } = createFixture();
    const { adapter, buildContexts, execute } = createAdapter();
    const fetchFn = vi.fn(async () => rawResponse(capabilityData));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(getReads()).toBe(0);
    expect(buildContexts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'connected service field',
      'connected',
      true,
      () => {
        const { connected: _connected, ...serviceWithoutConnected } = capabilities.services[0];
        return { ...capabilities, services: [serviceWithoutConnected] };
      },
    ],
    [
      'tool name field',
      'name',
      githubTool.name,
      () => {
        const { name: _name, ...toolWithoutName } = githubTool;
        return {
          ...capabilities,
          services: [{ ...capabilities.services[0], tools: [toolWithoutName] }],
        };
      },
    ],
  ])('rejects an inherited %s from a polluted prototype', async (_case, property, inheritedValue, createFixture) => {
    Object.defineProperty(Object.prototype, property, {
      configurable: true,
      enumerable: true,
      value: inheritedValue,
      writable: true,
    });
    try {
      const { adapter, buildContexts, execute } = createAdapter();
      const fetchFn = vi.fn(async () => rawResponse(createFixture()));

      const result = await createClient(fetchFn as typeof fetch)
        .user('user_123')
        .tools.list({ adapter });

      expect(result.data).toBeNull();
      expect(result.error).toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(buildContexts).toHaveLength(0);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(Object.prototype, property);
    }
  });

  it.each([
    [
      'snapshot ownKeys trap',
      () =>
        new Proxy(capabilities, {
          ownKeys: () => {
            throw new Error('snapshot clone leaked provider-access-token-secret');
          },
        }),
    ],
    [
      'service descriptor trap',
      () => ({
        ...capabilities,
        services: [
          new Proxy(capabilities.services[0], {
            getOwnPropertyDescriptor: () => {
              throw new Error('service clone leaked provider-access-token-secret');
            },
          }),
        ],
      }),
    ],
  ])('turns a %s into INVALID_RESPONSE without rejecting', async (_case, createFixture) => {
    const { adapter, buildContexts, execute } = createAdapter();
    const fetchFn = vi.fn(async () => rawResponse(createFixture()));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(JSON.stringify(result)).not.toMatch(/secret|stack/i);
    expect(buildContexts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    'adapter',
    'format',
  ] as const)('rejects an own %s accessor without invoking it', async (property) => {
    let accessorCalls = 0;
    const { adapter } = createAdapter();
    const options = {};
    Object.defineProperty(options, property, {
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        return property === 'adapter' ? adapter : 'mcp';
      },
    });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/tools?format=mcp')) {
        return response({ tools: [githubTool], version: 'version-1' });
      }
      if (url.endsWith('/capabilities?format=mcp')) {
        return response(capabilities);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const runtimeTools = createClient(fetchFn as typeof fetch).user('user_123')
      .tools as unknown as {
      list(options: unknown): Promise<Result<unknown>>;
    };

    const result = await runtimeTools.list(options);

    expect(result).toMatchObject({ data: null, error: { code: 'ADAPTER_ERROR' } });
    expect(accessorCalls).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['a null payload', null],
    ['an array payload', []],
    ['a mismatched external user', { ...capabilities, externalUserId: 'user_456' }],
    ['a non-MCP format', { ...capabilities, format: 'openai' }],
    ['a non-string version', { ...capabilities, version: 1 }],
    ['a missing services array', { ...capabilities, services: null }],
    [
      'an empty service ID',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], serviceId: '   ' }],
      },
    ],
    [
      'a non-boolean connected flag',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], connected: 'true' }],
      },
    ],
    [
      'a missing tools array',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], tools: null }],
      },
    ],
    [
      'a null tool definition',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], tools: [null] }],
      },
    ],
    [
      'an empty tool name',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], tools: [{ ...githubTool, name: '' }] }],
      },
    ],
    [
      'a non-string tool description',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], tools: [{ ...githubTool, description: 1 }] }],
      },
    ],
    [
      'a null input schema',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], tools: [{ ...githubTool, inputSchema: null }] }],
      },
    ],
    [
      'an array input schema',
      {
        ...capabilities,
        services: [{ ...capabilities.services[0], tools: [{ ...githubTool, inputSchema: [] }] }],
      },
    ],
    [
      'a non-JSON-compatible input schema',
      {
        ...capabilities,
        services: [
          {
            ...capabilities.services[0],
            tools: [{ ...githubTool, inputSchema: { createdAt: new Date() } }],
          },
        ],
      },
    ],
    [
      'a cyclic input schema',
      {
        ...capabilities,
        services: [
          {
            ...capabilities.services[0],
            tools: [{ ...githubTool, inputSchema: cyclicInputSchema }],
          },
        ],
      },
    ],
    [
      'a malformed disconnected tool',
      {
        ...capabilities,
        services: [
          {
            ...capabilities.services[1],
            tools: [{ ...slackTool, description: null }],
          },
        ],
      },
    ],
  ])('fails closed on %s from capabilities', async (_case, capabilityData) => {
    const { adapter, buildContexts, execute } = createAdapter();
    const fetchFn = vi.fn(async () => rawResponse(capabilityData));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(buildContexts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'duplicate service IDs',
      {
        ...capabilities,
        services: [capabilities.services[0], { ...capabilities.services[1], serviceId: 'github' }],
      },
    ],
    [
      'duplicate visible tool names',
      {
        ...capabilities,
        services: [
          capabilities.services[0],
          {
            ...capabilities.services[1],
            connected: true,
            status: 'connected',
            tools: [{ ...slackTool, name: githubTool.name }],
          },
        ],
      },
    ],
  ])('fails closed on %s before adapter build', async (_case, capabilityData) => {
    const { adapter, buildContexts, execute } = createAdapter();
    const fetchFn = vi.fn(async () => rawResponse(capabilityData));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(buildContexts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the definitions array',
      (tools: readonly UserToolDefinition[]) => {
        (tools as UserToolDefinition[]).push(tools[0]);
      },
    ],
    [
      'a definition property',
      (tools: readonly UserToolDefinition[]) => {
        (tools[0] as { name: string }).name = 'tampered_tool';
      },
    ],
    [
      'a nested input schema property',
      (tools: readonly UserToolDefinition[]) => {
        const properties = tools[0].inputSchema.properties as Record<string, unknown>;
        const title = properties.title as Record<string, unknown>;
        title.type = 'number';
      },
    ],
  ])('turns mutation of %s during build into ADAPTER_ERROR', async (_case, mutate) => {
    const execute = vi.fn(async (): Promise<Result<unknown>> => ({ data: {}, error: null }));
    const adapter: UserToolAdapter<{ ready: true }> = {
      format: 'mcp',
      build: ({ tools }) => {
        mutate(tools);
        return { ready: true };
      },
      execute,
    };
    const nestedCapabilities = {
      ...capabilities,
      services: [
        {
          ...capabilities.services[0],
          tools: [
            {
              ...githubTool,
              inputSchema: {
                type: 'object',
                properties: { title: { type: 'string' } },
              },
            },
          ],
        },
      ],
    };
    const fetchFn = vi.fn(async () => rawResponse(nestedCapabilities));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'ADAPTER_ERROR', message: 'Tool adapter failed to build.' },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps frozen model definitions and the allowlist unchanged after caught mutation attempts', async () => {
    const nestedTool = {
      ...githubTool,
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
      },
    };
    const nestedCapabilities = {
      ...capabilities,
      services: [{ ...capabilities.services[0], tools: [nestedTool] }],
    };
    const execute = vi.fn(
      async (): Promise<Result<unknown>> => ({ data: { ok: true }, error: null })
    );
    const adapter: UserToolAdapter<{
      definitions: readonly UserToolDefinition[];
      invoke: () => Promise<unknown>;
    }> = {
      format: 'mcp',
      build: ({ tools, execute: guardedExecute }) => {
        try {
          (tools as UserToolDefinition[]).push(tools[0]);
        } catch {}
        try {
          (tools[0] as { name: string }).name = 'tampered_tool';
        } catch {}
        try {
          const properties = tools[0].inputSchema.properties as Record<string, unknown>;
          (properties.title as Record<string, unknown>).type = 'number';
        } catch {}
        return {
          definitions: tools,
          invoke: () => guardedExecute(tools[0].serviceId, tools[0].name, { title: 'safe' }),
        };
      },
      execute,
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return rawResponse(nestedCapabilities);
      if (url.endsWith('/connections/github/credential-leases')) return response(credential);
      throw new Error(`Unexpected request: ${url}`);
    });

    const listed = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });
    const execution = await listed.data?.invoke();

    expect(listed.data?.definitions).toEqual([{ ...nestedTool, serviceId: 'github' }]);
    expect(Object.isFrozen(listed.data?.definitions)).toBe(true);
    expect(Object.isFrozen(listed.data?.definitions[0])).toBe(true);
    expect(Object.isFrozen(listed.data?.definitions[0].inputSchema)).toBe(true);
    expect(
      Object.isFrozen(
        (listed.data?.definitions[0].inputSchema.properties as Record<string, unknown>).title
      )
    ).toBe(true);
    expect(execution).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'github', toolName: 'github_create_issue' })
    );
  });

  it('allows duplicate tool names when only one definition is visible', async () => {
    const capabilityData = {
      ...capabilities,
      services: [
        capabilities.services[0],
        {
          ...capabilities.services[1],
          tools: [{ ...slackTool, name: githubTool.name }],
        },
      ],
    };
    const { adapter, buildContexts } = createAdapter();
    const fetchFn = vi.fn(async () => rawResponse(capabilityData));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result.error).toBeNull();
    expect(buildContexts[0].tools).toEqual([{ ...githubTool, serviceId: 'github' }]);
  });

  it('keeps one bound identity when a public expando changes during capability fetch', async () => {
    const userACapabilities = { ...capabilities, externalUserId: 'user_A' };
    let releaseCapabilities: ((value: Response) => void) | undefined;
    let capabilityFetchStarted: (() => void) | undefined;
    const capabilityStarted = new Promise<void>((resolve) => {
      capabilityFetchStarted = resolve;
    });
    const deferredCapabilities = new Promise<Response>((resolve) => {
      releaseCapabilities = resolve;
    });
    const fetchFn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/users/user_A/capabilities?format=mcp')) {
        capabilityFetchStarted?.();
        return deferredCapabilities;
      }
      if (url.endsWith('/users/user_A/connections/github/credential-leases')) {
        return Promise.resolve(response(credential));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    let buildExternalUserId: string | undefined;
    const execute = vi.fn(
      async (): Promise<Result<unknown>> => ({ data: { ok: true }, error: null })
    );
    const adapter: UserToolAdapter<{ invoke: () => Promise<unknown> }> = {
      format: 'mcp',
      build: (context) => {
        buildExternalUserId = context.externalUserId;
        return {
          invoke: () => context.execute('github', 'github_create_issue', { title: 'bound' }),
        };
      },
      execute,
    };
    const user = createClient(fetchFn as typeof fetch).user('user_A');

    const listing = user.tools.list({ adapter });
    await capabilityStarted;
    Object.defineProperty(user.tools, 'externalUserId', {
      configurable: true,
      enumerable: true,
      value: 'user_B',
      writable: true,
    });
    releaseCapabilities?.(rawResponse(userACapabilities));
    const listed = await listing;
    const execution = await listed.data?.invoke();

    expect(listed.error).toBeNull();
    expect(buildExternalUserId).toBe('user_A');
    expect(execution).toEqual({ ok: true });
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      'https://authlane.test/api/v1/users/user_A/capabilities?format=mcp',
      'https://authlane.test/api/v1/users/user_A/connections/github/credential-leases',
    ]);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ externalUserId: 'user_A', serviceId: 'github' })
    );
  });

  it.each([
    ['no own format', undefined, 'mcp'],
    ['an own format', 'openai', 'openai'],
  ] as const)('ignores an inherited adapter and inherited format with %s', async (_case, ownFormat, expectedFormat) => {
    const definitions = { tools: [githubTool], version: 'version-1' };
    const { adapter, buildContexts, execute } = createAdapter();
    const options = Object.create({ adapter, format: 'openai' }) as Record<string, unknown>;
    if (ownFormat !== undefined) {
      Object.defineProperty(options, 'format', {
        configurable: true,
        enumerable: true,
        value: ownFormat,
        writable: true,
      });
    }
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/tools?format=mcp') || url.endsWith('/tools?format=openai')) {
        return response(definitions);
      }
      if (url.endsWith('/capabilities?format=mcp')) {
        return response(capabilities);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const runtimeTools = createClient(fetchFn as typeof fetch).user('user_123')
      .tools as unknown as {
      list(options: unknown): Promise<Result<unknown>>;
    };

    const result = await runtimeTools.list(options);

    expect(result).toEqual({ data: definitions, error: null });
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      `https://authlane.test/api/v1/users/user_123/tools?format=${expectedFormat}`,
    ]);
    expect(buildContexts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('accepts adapter methods defined on a class prototype', async () => {
    class ClassAdapter implements UserToolAdapter<{ ready: true }> {
      readonly format = 'mcp' as const;
      buildCalls = 0;

      build(): { ready: true } {
        this.buildCalls += 1;
        return { ready: true };
      }

      async execute(): Promise<Result<unknown>> {
        return { data: { ok: true }, error: null };
      }
    }

    const adapter = new ClassAdapter();
    const fetchFn = vi.fn(async () => response(capabilities));

    const result = await createClient(fetchFn as typeof fetch)
      .user('user_123')
      .tools.list({ adapter });

    expect(result).toEqual({ data: { ready: true }, error: null });
    expect(adapter.buildCalls).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null options', () => null],
    ['primitive options', () => 1],
    [
      'an options descriptor trap that throws',
      () =>
        new Proxy(
          {},
          {
            getOwnPropertyDescriptor: () => {
              throw new Error('options descriptor with provider-access-token-secret');
            },
          }
        ),
    ],
    ['a null adapter', () => ({ adapter: null })],
    [
      'an adapter getter that throws',
      () => ({
        adapter: new Proxy(
          {},
          {
            get: () => {
              throw new Error('adapter getter with provider-access-token-secret');
            },
          }
        ),
      }),
    ],
    [
      'an unsupported adapter format',
      () => ({
        adapter: { format: 'openai', build: () => ({ ready: true }), execute: vi.fn() },
      }),
    ],
    ['a missing adapter build method', () => ({ adapter: { format: 'mcp', execute: vi.fn() } })],
    [
      'a missing adapter execute method',
      () => ({ adapter: { format: 'mcp', build: () => ({ ready: true }) } }),
    ],
  ])('returns SDK ADAPTER_ERROR for %s', async (_case, createOptions) => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/capabilities?format=mcp')) return rawResponse(capabilities);
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = createClient(fetchFn as typeof fetch).user('user_123');
    const runtimeTools = user.tools as unknown as {
      list(options: unknown): Promise<Result<unknown>>;
    };

    const result = await runtimeTools.list(createOptions());

    expect(result).toEqual({
      data: null,
      error: {
        code: 'ADAPTER_ERROR',
        message: 'Tool adapter failed to build.',
        hint: 'Check the adapter configuration and ensure build completes synchronously.',
        docUrl: 'https://app.authlane.io/docs/sdk/typescript',
      },
    });
  });

  it('returns the cached invalid-scope error before inspecting explosive options', async () => {
    const fetchFn = vi.fn();
    const user = createClient(fetchFn as typeof fetch).user('');
    const cachedValidation = await user.connections.list();
    const runtimeTools = user.tools as unknown as {
      list(options: unknown): Promise<Result<unknown>>;
    };
    const explosiveOptions = new Proxy(
      {},
      {
        get: () => {
          throw new Error('must not inspect invalid-scope options');
        },
      }
    );

    const result = await runtimeTools.list(explosiveOptions);

    expect(result).toEqual(cachedValidation);
    expect(result.error).toBe(cachedValidation.error);
    expect(fetchFn).not.toHaveBeenCalled();
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

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'ADAPTER_ERROR',
        message: 'Tool adapter failed to build.',
        hint: 'Check the adapter configuration and ensure build completes synchronously.',
        docUrl: 'https://app.authlane.io/docs/sdk/typescript',
      },
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

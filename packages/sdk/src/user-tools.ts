import { AsyncLocalStorage } from 'node:async_hooks';
import { ErrorCodes, Errors } from './errors.js';
import type { CapabilitiesResource } from './resources/capabilities.js';
import type { CredentialLeasesResource } from './resources/credential-leases.js';
import type { ToolsResource } from './resources/tools.js';
import type {
  CredentialLease,
  MCPTool,
  Result,
  ToolsResponse,
  UserScopeToolOptions,
} from './types.js';

export interface UserToolDefinition extends MCPTool {
  readonly serviceId: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface UserToolAdapter<T> {
  readonly format: 'mcp';
  build(context: {
    readonly externalUserId: string;
    readonly tools: readonly UserToolDefinition[];
    readonly execute: (
      serviceId: string,
      toolName: string,
      input: Record<string, unknown>
    ) => Promise<unknown>;
  }): T;
  execute(input: {
    readonly externalUserId: string;
    readonly serviceId: string;
    readonly toolName: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly credential: CredentialLease;
  }): Promise<Result<unknown>>;
}

export type UserToolAdapterOptions<T> = {
  adapter: UserToolAdapter<T>;
  format?: never;
  externalUserId?: never;
};

interface UserToolsResources {
  tools: ToolsResource;
  capabilities: CapabilitiesResource;
  credentialLeases: CredentialLeasesResource;
}

interface ValidatedUserToolAdapter<T> {
  readonly target: UserToolAdapter<T>;
  readonly build: UserToolAdapter<T>['build'];
  readonly execute: UserToolAdapter<T>['execute'];
}

type RunUserOperation = <T>(operation: () => Promise<Result<T>>) => Promise<Result<T>>;

interface ToolErrorResult {
  error: {
    code: string;
    message: string;
  };
}

const toolError = (code: string, message: string): ToolErrorResult => ({
  error: { code, message },
});

const adapterBuildContext = new AsyncLocalStorage<boolean>();
const asyncBuildResult = Symbol('asyncBuildResult');

const absorbThenable = (value: unknown): boolean => {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return false;
  }

  const then = (value as { then?: unknown }).then;
  if (typeof then !== 'function') {
    return false;
  }

  void new Promise<unknown>((resolve, reject) => {
    then.call(value, resolve, reject);
  }).catch(() => undefined);
  return true;
};

type JsonCloneResult = { ok: true; value: unknown } | { ok: false };

const invalidJsonClone: JsonCloneResult = { ok: false };

const cloneJsonValue = (value: unknown, ancestors = new WeakSet<object>()): JsonCloneResult => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return { ok: true, value };
  }
  if (typeof value !== 'object') {
    return invalidJsonClone;
  }
  if (ancestors.has(value)) {
    return invalidJsonClone;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return invalidJsonClone;
      }
      const keys = Reflect.ownKeys(value);
      if (
        keys.some(
          (key) => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))
        )
      ) {
        return invalidJsonClone;
      }

      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          return invalidJsonClone;
        }
        const item = cloneJsonValue(descriptor.value, ancestors);
        if (!item.ok) {
          return invalidJsonClone;
        }
        clone.push(item.value);
      }
      return { ok: true, value: clone };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidJsonClone;
    }
    const clone: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        return invalidJsonClone;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return invalidJsonClone;
      }
      const property = cloneJsonValue(descriptor.value, ancestors);
      if (!property.ok) {
        return invalidJsonClone;
      }
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: property.value,
        writable: true,
      });
    }
    return { ok: true, value: clone };
  } finally {
    ancestors.delete(value);
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const deepFreezeJsonValue = (value: unknown): void => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const child of Object.values(value)) {
    deepFreezeJsonValue(child);
  }
  Object.freeze(value);
};

const connectionStatuses = new Set(['disconnected', 'pending', 'connected', 'expired', 'error']);

const validateCapabilityTools = (
  data: unknown,
  externalUserId: string
): UserToolDefinition[] | null => {
  if (
    !isPlainObject(data) ||
    data.externalUserId !== externalUserId ||
    data.format !== 'mcp' ||
    typeof data.version !== 'string' ||
    !Array.isArray(data.services)
  ) {
    return null;
  }

  const serviceIds = new Set<string>();
  const visibleToolNames = new Set<string>();
  const visibleTools: UserToolDefinition[] = [];
  for (const service of data.services) {
    if (
      !isPlainObject(service) ||
      typeof service.serviceId !== 'string' ||
      service.serviceId.trim().length === 0 ||
      serviceIds.has(service.serviceId) ||
      typeof service.connected !== 'boolean' ||
      typeof service.status !== 'string' ||
      !connectionStatuses.has(service.status) ||
      (service.expiresAt !== null && typeof service.expiresAt !== 'string') ||
      !Array.isArray(service.tools)
    ) {
      return null;
    }
    serviceIds.add(service.serviceId);

    for (const tool of service.tools) {
      if (
        !isPlainObject(tool) ||
        typeof tool.name !== 'string' ||
        tool.name.trim().length === 0 ||
        typeof tool.description !== 'string'
      ) {
        return null;
      }
      const inputSchema = cloneJsonValue(tool.inputSchema);
      if (!inputSchema.ok || !isPlainObject(inputSchema.value)) {
        return null;
      }

      if (service.connected === true) {
        if (visibleToolNames.has(tool.name)) {
          return null;
        }
        visibleToolNames.add(tool.name);
        deepFreezeJsonValue(inputSchema.value);
        visibleTools.push(
          Object.freeze({
            serviceId: service.serviceId,
            name: tool.name,
            description: tool.description,
            inputSchema: inputSchema.value,
          })
        );
      }
    }
  }
  Object.freeze(visibleTools);
  return visibleTools;
};

export class UserToolsResource {
  readonly #externalUserId: string;

  constructor(
    externalUserId: string,
    private readonly resources: UserToolsResources,
    private readonly run: RunUserOperation
  ) {
    this.#externalUserId = externalUserId;
  }

  list<T>(options: UserToolAdapterOptions<T>): Promise<Result<T>>;
  list(options?: UserScopeToolOptions): Promise<Result<ToolsResponse>>;
  list<T>(
    options: UserScopeToolOptions | UserToolAdapterOptions<T> = {}
  ): Promise<Result<ToolsResponse | T>> {
    return this.run(async () => {
      try {
        return await this.listValidated(options);
      } catch {
        return { data: null, error: Errors.adapterError() };
      }
    });
  }

  private async listValidated<T>(options: unknown): Promise<Result<ToolsResponse | T>> {
    if (options === undefined) {
      return this.resources.tools.list({ externalUserId: this.#externalUserId, format: undefined });
    }
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      return { data: null, error: Errors.adapterError() };
    }

    const candidate = options as {
      adapter?: unknown;
      format?: unknown;
    };
    const adapter = candidate.adapter;
    if (adapter === undefined) {
      const format = candidate.format;
      if (format !== undefined && format !== 'mcp' && format !== 'openai') {
        return { data: null, error: Errors.adapterError() };
      }
      return this.resources.tools.list({
        externalUserId: this.#externalUserId,
        format,
      });
    }
    if ((typeof adapter !== 'object' || adapter === null) && typeof adapter !== 'function') {
      return { data: null, error: Errors.adapterError() };
    }

    const typedAdapter = adapter as UserToolAdapter<T>;
    const format = typedAdapter.format;
    const build = typedAdapter.build;
    const execute = typedAdapter.execute;
    if (format !== 'mcp' || typeof build !== 'function' || typeof execute !== 'function') {
      return { data: null, error: Errors.adapterError() };
    }

    const externalUserId = this.#externalUserId;
    return this.listWithAdapter({ target: typedAdapter, build, execute }, externalUserId);
  }

  private async listWithAdapter<T>(
    adapter: ValidatedUserToolAdapter<T>,
    externalUserId: string
  ): Promise<Result<T>> {
    const capabilities = await this.resources.capabilities.get({
      externalUserId,
      format: 'mcp',
    });
    if (capabilities.error) {
      return { data: null, error: capabilities.error };
    }

    let tools: UserToolDefinition[] | null;
    try {
      tools = validateCapabilityTools(capabilities.data as unknown, externalUserId);
    } catch {
      tools = null;
    }
    if (!tools) {
      return {
        data: null,
        error: Errors.invalidResponse('Capability snapshot is malformed.'),
      };
    }
    const allowlist = new Map<string, Set<string>>();
    for (const tool of tools) {
      const serviceTools = allowlist.get(tool.serviceId) ?? new Set<string>();
      serviceTools.add(tool.name);
      allowlist.set(tool.serviceId, serviceTools);
    }

    const execute = async (
      serviceId: string,
      toolName: string,
      input: Record<string, unknown>
    ): Promise<unknown> => {
      if (adapterBuildContext.getStore()) {
        return toolError(
          ErrorCodes.TOOL_NOT_AVAILABLE,
          'Tool execution is not available during adapter build.'
        );
      }
      if (!allowlist.get(serviceId)?.has(toolName)) {
        return toolError(ErrorCodes.TOOL_NOT_AVAILABLE, 'Tool is not available for this user.');
      }

      const lease = await this.resources.credentialLeases.create({
        externalUserId,
        serviceId,
      });
      if (lease.error) {
        return toolError(
          ErrorCodes.CREDENTIAL_LEASE_ERROR,
          'Credential lease could not be issued.'
        );
      }

      try {
        const result = await adapter.execute.call(adapter.target, {
          externalUserId,
          serviceId,
          toolName,
          arguments: input,
          credential: lease.data,
        });
        if (result.error) {
          return toolError(ErrorCodes.ADAPTER_ERROR, 'Tool execution failed.');
        }
        return result.data;
      } catch {
        return toolError(ErrorCodes.ADAPTER_ERROR, 'Tool execution failed.');
      }
    };

    try {
      const data = adapterBuildContext.run(true, () => {
        const buildResult = adapter.build.call(adapter.target, {
          externalUserId,
          tools,
          execute,
        });
        return absorbThenable(buildResult) ? asyncBuildResult : buildResult;
      });
      if (data === asyncBuildResult) {
        return { data: null, error: Errors.adapterError() };
      }
      return { data, error: null };
    } catch {
      return { data: null, error: Errors.adapterError() };
    }
  }
}

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
const thenableObservationDepthLimit = 16;

type ObjectLike = object | ((...args: never[]) => unknown);

const isObjectLike = (value: unknown): value is ObjectLike =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

const ignoreRejection = (): undefined => undefined;

const isNativePromise = (value: ObjectLike): value is Promise<unknown> => {
  try {
    return value instanceof Promise;
  } catch {
    return false;
  }
};

const observeNativePromise = (promise: Promise<unknown>): void => {
  try {
    void Reflect.apply(Promise.prototype.then, promise, [undefined, ignoreRejection]);
  } catch {
    // An incompatible promise-like object is rejected by the adapter boundary.
  }
};

const callForeignThen = (
  value: ObjectLike,
  then: unknown,
  seen: WeakSet<ObjectLike>,
  depth: number
): void => {
  if (typeof then !== 'function') {
    return;
  }
  let returned: unknown;
  const observeFulfillment = (fulfilled: unknown): undefined => {
    try {
      observeReturnedThenable(fulfilled, seen, depth + 1);
    } catch {
      // Foreign settlement callbacks must not escape the adapter boundary.
    }
    return undefined;
  };
  try {
    returned = Reflect.apply(then, value, [observeFulfillment, ignoreRejection]);
  } catch {
    return;
  }
  observeReturnedThenable(returned, seen, depth + 1);
};

const observeReturnedThenable = (
  value: unknown,
  seen: WeakSet<ObjectLike>,
  depth: number
): void => {
  if (!isObjectLike(value)) {
    return;
  }
  if (isNativePromise(value)) {
    observeNativePromise(value);
    return;
  }
  if (depth >= thenableObservationDepthLimit || seen.has(value)) {
    return;
  }
  seen.add(value);

  let then: unknown;
  try {
    then = Reflect.get(value, 'then');
  } catch {
    return;
  }
  if (typeof then !== 'function') {
    return;
  }
  callForeignThen(value, then, seen, depth);
};

const absorbThenable = (value: unknown): boolean => {
  if (!isObjectLike(value)) {
    return false;
  }

  if (isNativePromise(value)) {
    observeNativePromise(value);
    return true;
  }

  let then: unknown;
  try {
    then = Reflect.get(value, 'then');
  } catch {
    return true;
  }
  if (typeof then !== 'function') {
    return false;
  }

  const seen = new WeakSet<ObjectLike>();
  seen.add(value);
  callForeignThen(value, then, seen, 0);
  return true;
};

type JsonCloneResult = { ok: true; value: unknown } | { ok: false };

const invalidJsonClone: JsonCloneResult = { ok: false };

// Capability snapshots are small; these conservative limits bound clone and freeze work.
const jsonSnapshotMaxDepth = 64;
const jsonSnapshotMaxContainerNodes = 10_000;
const jsonSnapshotMaxContainerEntries = 10_000;
const jsonSnapshotMaxTotalEntries = 50_000;

interface JsonCloneState {
  readonly seen: WeakSet<object>;
  containerNodes: number;
  totalEntries: number;
}

const reserveCloneEntries = (state: JsonCloneState, count: number): boolean => {
  if (
    count > jsonSnapshotMaxContainerEntries ||
    state.totalEntries > jsonSnapshotMaxTotalEntries - count
  ) {
    return false;
  }
  state.totalEntries += count;
  return true;
};

const cloneJsonValue = (
  value: unknown,
  state: JsonCloneState = {
    seen: new WeakSet<object>(),
    containerNodes: 0,
    totalEntries: 0,
  },
  depth = 0
): JsonCloneResult => {
  if (depth > jsonSnapshotMaxDepth) {
    return invalidJsonClone;
  }
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
  if (state.seen.has(value)) {
    return invalidJsonClone;
  }
  state.containerNodes += 1;
  if (state.containerNodes > jsonSnapshotMaxContainerNodes) {
    return invalidJsonClone;
  }

  state.seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return invalidJsonClone;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      lengthDescriptor.configurable ||
      lengthDescriptor.enumerable ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      !reserveCloneEntries(state, lengthDescriptor.value)
    ) {
      return invalidJsonClone;
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== length + 1 ||
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          (key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number.parseInt(key, 10) >= length))
      )
    ) {
      return invalidJsonClone;
    }

    const clone: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return invalidJsonClone;
      }
      const item = cloneJsonValue(descriptor.value, state, depth + 1);
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
  const clone = Object.create(null) as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  if (!reserveCloneEntries(state, keys.length)) {
    return invalidJsonClone;
  }
  for (const key of keys) {
    if (typeof key !== 'string') {
      return invalidJsonClone;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      return invalidJsonClone;
    }
    const property = cloneJsonValue(descriptor.value, state, depth + 1);
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
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const deepFreezeJsonValue = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) {
    return true;
  }

  const visited = new WeakSet<object>();
  const stack: Array<{ depth: number; expanded: boolean; value: object }> = [
    { depth: 0, expanded: false, value },
  ];
  let containerNodes = 0;
  let totalEntries = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      return false;
    }
    if (current.expanded) {
      Object.freeze(current.value);
      continue;
    }
    if (visited.has(current.value)) {
      continue;
    }
    if (current.depth > jsonSnapshotMaxDepth) {
      return false;
    }
    visited.add(current.value);
    containerNodes += 1;
    if (containerNodes > jsonSnapshotMaxContainerNodes) {
      return false;
    }

    const keys = Reflect.ownKeys(current.value);
    let entryCount = keys.length;
    if (Array.isArray(current.value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(current.value, 'length');
      if (!lengthDescriptor || !('value' in lengthDescriptor)) {
        return false;
      }
      entryCount = lengthDescriptor.value;
    }
    if (
      entryCount > jsonSnapshotMaxContainerEntries ||
      totalEntries > jsonSnapshotMaxTotalEntries - entryCount
    ) {
      return false;
    }
    totalEntries += entryCount;

    stack.push({ ...current, expanded: true });
    for (const key of keys) {
      if (Array.isArray(current.value) && key === 'length') {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return false;
      }
      if (typeof descriptor.value === 'object' && descriptor.value !== null) {
        stack.push({ depth: current.depth + 1, expanded: false, value: descriptor.value });
      }
    }
  }
  return true;
};

const connectionStatuses = new Set(['disconnected', 'pending', 'connected', 'expired', 'error']);

const validateCapabilityTools = (
  data: unknown,
  externalUserId: string
): UserToolDefinition[] | null => {
  const clonedSnapshot = cloneJsonValue(data);
  if (!clonedSnapshot.ok || !isPlainObject(clonedSnapshot.value)) {
    return null;
  }
  const snapshot = clonedSnapshot.value;
  if (
    snapshot.externalUserId !== externalUserId ||
    snapshot.format !== 'mcp' ||
    typeof snapshot.version !== 'string' ||
    !Array.isArray(snapshot.services)
  ) {
    return null;
  }

  const serviceIds = new Set<string>();
  const visibleToolNames = new Set<string>();
  const visibleTools: UserToolDefinition[] = [];
  for (const service of snapshot.services) {
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
      const inputSchema = tool.inputSchema;
      if (!isPlainObject(inputSchema)) {
        return null;
      }

      if (service.connected === true) {
        if (visibleToolNames.has(tool.name)) {
          return null;
        }
        visibleToolNames.add(tool.name);
        if (!deepFreezeJsonValue(inputSchema)) {
          return null;
        }
        visibleTools.push(
          Object.freeze({
            serviceId: service.serviceId,
            name: tool.name,
            description: tool.description,
            inputSchema,
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

    const adapterDescriptor = Object.getOwnPropertyDescriptor(options, 'adapter');
    const formatDescriptor = Object.getOwnPropertyDescriptor(options, 'format');
    if (
      (adapterDescriptor !== undefined && !('value' in adapterDescriptor)) ||
      (formatDescriptor !== undefined && !('value' in formatDescriptor))
    ) {
      return { data: null, error: Errors.adapterError() };
    }

    const adapter = adapterDescriptor?.value;
    const optionFormat = formatDescriptor?.value;
    if (adapter === undefined) {
      if (optionFormat !== undefined && optionFormat !== 'mcp' && optionFormat !== 'openai') {
        return { data: null, error: Errors.adapterError() };
      }
      return this.resources.tools.list({
        externalUserId: this.#externalUserId,
        format: optionFormat,
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

import { isProxy } from 'node:util/types';
import type { UserToolAdapter } from '@authlane/sdk';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
  type Tool,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createBuiltInAdapter, type FrameworkAdapterOptions } from './adapter.js';

const toolExecutionFailed = () => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: 'Tool execution failed.' }],
});

function isExecutorError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (isProxy(value)) {
    return false;
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== 'error') {
      return false;
    }
    const errorDescriptor = Object.getOwnPropertyDescriptor(value, 'error');
    if (
      !errorDescriptor?.enumerable ||
      !('value' in errorDescriptor) ||
      typeof errorDescriptor.value !== 'object' ||
      errorDescriptor.value === null ||
      isProxy(errorDescriptor.value)
    ) {
      return false;
    }

    const error = errorDescriptor.value;
    const errorPrototype = Object.getPrototypeOf(error);
    if (errorPrototype !== Object.prototype && errorPrototype !== null) {
      return false;
    }
    const errorKeys = Reflect.ownKeys(error);
    if (errorKeys.length !== 2 || !errorKeys.includes('code') || !errorKeys.includes('message')) {
      return false;
    }
    const codeDescriptor = Object.getOwnPropertyDescriptor(error, 'code');
    const messageDescriptor = Object.getOwnPropertyDescriptor(error, 'message');
    if (
      !codeDescriptor?.enumerable ||
      !('value' in codeDescriptor) ||
      typeof codeDescriptor.value !== 'string' ||
      !messageDescriptor?.enumerable ||
      !('value' in messageDescriptor) ||
      typeof messageDescriptor.value !== 'string'
    ) {
      return false;
    }
    return knownSdkExecutionErrors.get(codeDescriptor.value)?.has(messageDescriptor.value) === true;
  } catch {
    return false;
  }
}

const knownSdkExecutionErrors = new Map<string, ReadonlySet<string>>([
  [
    'TOOL_NOT_AVAILABLE',
    new Set([
      'Tool execution is not available during adapter build.',
      'Tool is not available for this user.',
    ]),
  ],
  ['CREDENTIAL_LEASE_ERROR', new Set(['Credential lease could not be issued.'])],
  ['ADAPTER_ERROR', new Set(['Tool execution failed.'])],
]);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonCloneResult = { readonly ok: true; readonly value: JsonValue } | { readonly ok: false };

const invalidJsonClone: JsonCloneResult = { ok: false };
const maxJsonDepth = 32;
const maxJsonContainerNodes = 1_000;
const maxJsonContainerEntries = 1_000;
const maxJsonTotalEntries = 10_000;
const maxJsonStringCharacters = 1_000_000;

interface JsonCloneState {
  readonly seen: WeakSet<object>;
  containerNodes: number;
  totalEntries: number;
  stringCharacters: number;
}

function reserveStringCharacters(state: JsonCloneState, count: number): boolean {
  if (state.stringCharacters > maxJsonStringCharacters - count) {
    return false;
  }
  state.stringCharacters += count;
  return true;
}

function reserveEntries(state: JsonCloneState, count: number): boolean {
  if (count > maxJsonContainerEntries || state.totalEntries > maxJsonTotalEntries - count) {
    return false;
  }
  state.totalEntries += count;
  return true;
}

function cloneJsonValue(
  value: unknown,
  state: JsonCloneState = {
    seen: new WeakSet<object>(),
    containerNodes: 0,
    totalEntries: 0,
    stringCharacters: 0,
  },
  depth = 0
): JsonCloneResult {
  if (depth > maxJsonDepth) {
    return invalidJsonClone;
  }
  if (value === null || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : invalidJsonClone;
  }
  if (typeof value === 'string') {
    if (!reserveStringCharacters(state, value.length)) {
      return invalidJsonClone;
    }
    return { ok: true, value };
  }
  if (typeof value !== 'object' || isProxy(value)) {
    return invalidJsonClone;
  }

  try {
    if (state.seen.has(value)) {
      return invalidJsonClone;
    }
    state.containerNodes += 1;
    if (state.containerNodes > maxJsonContainerNodes) {
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
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        !reserveEntries(state, lengthDescriptor.value)
      ) {
        return invalidJsonClone;
      }
      const length = lengthDescriptor.value;
      const keys = Reflect.ownKeys(value);
      if (keys.length !== length + 1) {
        return invalidJsonClone;
      }

      const clone: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor)) {
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
    const keys = Reflect.ownKeys(value);
    if (!reserveEntries(state, keys.length)) {
      return invalidJsonClone;
    }
    for (const key of keys) {
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !reserveStringCharacters(state, key.length)
      ) {
        return invalidJsonClone;
      }
    }
    const clone = Object.create(null) as { [key: string]: JsonValue };
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
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
  } catch {
    return invalidJsonClone;
  }
}

function normalizeToolOutput(value: unknown): {
  readonly text: string;
  readonly structuredContent: Record<string, unknown>;
} | null {
  const cloned = cloneJsonValue(value);
  if (!cloned.ok) {
    return null;
  }

  const structuredContent =
    typeof cloned.value === 'object' && cloned.value !== null && !Array.isArray(cloned.value)
      ? (cloned.value as Record<string, unknown>)
      : { result: cloned.value };
  try {
    const text = JSON.stringify(structuredContent);
    const canonical = JSON.parse(text) as unknown;
    if (typeof canonical !== 'object' || canonical === null || Array.isArray(canonical)) {
      return null;
    }
    const parsed = CallToolResultSchema.safeParse({
      content: [{ type: 'text', text }],
      structuredContent: canonical,
    });
    if (
      !parsed.success ||
      parsed.data.structuredContent === undefined ||
      JSON.stringify(parsed.data.structuredContent) !== text
    ) {
      return null;
    }
    return { text, structuredContent: parsed.data.structuredContent };
  } catch {
    return null;
  }
}

function cloneToolInput(value: unknown): Record<string, unknown> | null {
  const cloned = cloneJsonValue(value);
  return cloned.ok &&
    typeof cloned.value === 'object' &&
    cloned.value !== null &&
    !Array.isArray(cloned.value)
    ? (cloned.value as Record<string, unknown>)
    : null;
}

export function mcpServer(options: FrameworkAdapterOptions = {}): UserToolAdapter<Server> {
  return createBuiltInAdapter<Server>(({ tools, execute }) => {
    const byName = new Map<string, Readonly<{ serviceId: string; name: string }>>();
    for (const definition of tools) {
      if (byName.has(definition.name)) {
        throw new Error('Duplicate MCP tool definitions are not supported.');
      }
      byName.set(
        definition.name,
        Object.freeze({ serviceId: definition.serviceId, name: definition.name })
      );
    }

    const server = new Server(
      { name: 'authlane-user-tools', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );
    const protocolTools: Tool[] = [];
    for (const { name, description, inputSchema } of tools) {
      const clonedInputSchema = cloneToolInput(inputSchema);
      const parsed = ToolSchema.safeParse({ name, description, inputSchema: clonedInputSchema });
      if (!clonedInputSchema || !parsed.success) {
        throw new Error('Invalid MCP tool definition.');
      }
      protocolTools.push(parsed.data);
    }

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: protocolTools }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const definition = byName.get(params.name);
      if (!definition) {
        return toolExecutionFailed();
      }
      const input = cloneToolInput(params.arguments === undefined ? {} : params.arguments);
      if (!input) {
        return toolExecutionFailed();
      }

      try {
        const result = await execute(definition.serviceId, definition.name, input);
        if (isExecutorError(result)) {
          return toolExecutionFailed();
        }
        const output = normalizeToolOutput(result);
        if (!output) {
          return toolExecutionFailed();
        }
        return {
          content: [{ type: 'text' as const, text: output.text }],
          structuredContent: output.structuredContent,
        };
      } catch {
        return toolExecutionFailed();
      }
    });

    return server;
  }, options);
}

import { isProxy } from 'node:util/types';
import type { UserToolAdapter } from '@authlane/sdk';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
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
    return true;
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'error');
    return Boolean(
      descriptor &&
        'value' in descriptor &&
        descriptor.value !== null &&
        descriptor.value !== undefined
    );
  } catch {
    return true;
  }
}

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
    if (state.stringCharacters > maxJsonStringCharacters - value.length) {
      return invalidJsonClone;
    }
    state.stringCharacters += value.length;
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
    const keys = Reflect.ownKeys(value);
    if (!reserveEntries(state, keys.length)) {
      return invalidJsonClone;
    }
    const clone = Object.create(null) as { [key: string]: JsonValue };
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
    return { text: JSON.stringify(cloned.value), structuredContent };
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
    const protocolTools: Tool[] = tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: inputSchema as Tool['inputSchema'],
    }));

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

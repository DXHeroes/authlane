import type { UserToolAdapter } from '@authlane/sdk';
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';
import { createBuiltInAdapter, type FrameworkAdapterOptions } from './adapter.js';

const invalidToolInput = () => ({
  error: { code: 'INVALID_TOOL_INPUT', message: 'Tool input must be a JSON object.' },
});

const toolExecutionFailed = () => ({
  error: { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed.' },
});

function asToolInput(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function vercelAI(options: FrameworkAdapterOptions = {}): UserToolAdapter<ToolSet> {
  return createBuiltInAdapter<ToolSet>(({ tools, execute }) => {
    const toolSet = Object.create(null) as ToolSet;

    for (const definition of tools) {
      const serviceId = definition.serviceId;
      const name = definition.name;
      const description = definition.description;
      const inputSchema = definition.inputSchema;

      toolSet[name] = dynamicTool({
        description,
        inputSchema: jsonSchema(inputSchema as Parameters<typeof jsonSchema>[0]),
        async execute(modelInput) {
          const input = asToolInput(modelInput);
          if (!input) {
            return invalidToolInput();
          }

          try {
            return await execute(serviceId, name, input);
          } catch {
            return toolExecutionFailed();
          }
        },
      });
    }

    return toolSet;
  }, options);
}

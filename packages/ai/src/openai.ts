import type { UserToolAdapter } from '@authlane/sdk';
import { type FunctionTool, tool } from '@openai/agents';
import { createBuiltInAdapter, type FrameworkAdapterOptions, requiresApproval } from './adapter.js';

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

type NonStrictJsonObjectSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: true;
  description?: string;
};

export function openAIAgents(
  options: FrameworkAdapterOptions = {}
): UserToolAdapter<FunctionTool[]> {
  return createBuiltInAdapter<FunctionTool[]>(
    ({ tools, execute }) =>
      tools.map((definition) => {
        const serviceId = definition.serviceId;
        const name = definition.name;
        const description = definition.description;
        const parameters = definition.inputSchema;

        return tool({
          name,
          description,
          parameters: parameters as unknown as NonStrictJsonObjectSchema,
          strict: false,
          needsApproval: requiresApproval(definition.risk, options.approval),
          errorFunction: () => JSON.stringify(invalidToolInput()),
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
        }) as unknown as FunctionTool;
      }),
    options
  );
}

import type { UserToolAdapter } from '@authlane/sdk';
import type { PublicSchema } from '@mastra/core/schema';
import { createTool, isValidationError, type Tool } from '@mastra/core/tools';
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

export type MastraToolSet = Record<string, Tool>;

export function mastraAI(options: FrameworkAdapterOptions = {}): UserToolAdapter<MastraToolSet> {
  return createBuiltInAdapter<MastraToolSet>(({ tools, execute }) => {
    const toolSet = Object.create(null) as MastraToolSet;

    for (const definition of tools) {
      const serviceId = definition.serviceId;
      const name = definition.name;
      const mastraTool = createTool({
        id: name,
        description: definition.description,
        inputSchema: definition.inputSchema as PublicSchema<Record<string, unknown>>,
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

      const executeWithMastraValidation = mastraTool.execute?.bind(mastraTool);
      if (executeWithMastraValidation) {
        mastraTool.execute = async (modelInput, context) => {
          if (!asToolInput(modelInput)) {
            return invalidToolInput();
          }

          try {
            const result = await executeWithMastraValidation(modelInput, context);
            return isValidationError(result) ? invalidToolInput() : result;
          } catch {
            return toolExecutionFailed();
          }
        };
      }

      toolSet[name] = mastraTool as Tool;
    }

    return toolSet;
  }, options);
}

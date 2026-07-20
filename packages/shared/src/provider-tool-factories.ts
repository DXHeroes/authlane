import type { ToolHandler } from './types.js';

export interface PublicProviderToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
    readonly openWorldHint: boolean;
  };
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

function handlerDefinition(definition: PublicProviderToolDefinition): ToolHandler['definition'] {
  return {
    name: definition.name,
    description: definition.description,
    annotations: { ...definition.annotations },
    inputSchema: definition.inputSchema as ToolHandler['definition']['inputSchema'],
  };
}

export function createProviderMcpOnlyTools(
  definitions: readonly PublicProviderToolDefinition[]
): Record<string, ToolHandler> {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.name,
      {
        definition: handlerDefinition(definition),
        handler: async () => {
          throw new Error('This tool requires the provider MCP server');
        },
      },
    ])
  );
}

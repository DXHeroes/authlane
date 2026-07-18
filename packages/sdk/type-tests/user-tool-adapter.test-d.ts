import type { Result, UserScopeTools, UserToolAdapter, UserToolDefinition } from '../src/index.js';

interface FrameworkToolset {
  invoke(name: string, input: Record<string, unknown>): Promise<unknown>;
}

declare const tools: UserScopeTools;
declare const adapter: UserToolAdapter<FrameworkToolset>;
declare const definition: UserToolDefinition;

const inferred: Promise<Result<FrameworkToolset>> = tools.list({ adapter });
const definitionsOnly = tools.list();
const formattedDefinitionsOnly = tools.list({ format: 'openai' });

// @ts-expect-error Adapter-aware listing always gets MCP definitions from adapter.format.
tools.list({ adapter, format: 'openai' });
// @ts-expect-error A user-scoped adapter call cannot override the bound external user ID.
tools.list({ adapter, externalUserId: 'other-user' });

const serviceId: string = definition.serviceId;

void inferred;
void definitionsOnly;
void formattedDefinitionsOnly;
void serviceId;

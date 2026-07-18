import type { Result, UserScopeTools, UserToolAdapter, UserToolDefinition } from '../src/index.js';

interface FrameworkToolset {
  invoke(name: string, input: Record<string, unknown>): Promise<unknown>;
}

declare const tools: UserScopeTools;
declare const adapter: UserToolAdapter<FrameworkToolset>;
declare const definition: UserToolDefinition;
declare const buildContext: Parameters<UserToolAdapter<FrameworkToolset>['build']>[0];

const inferred: Promise<Result<FrameworkToolset>> = tools.list({ adapter });
const definitionsOnly = tools.list();
const undefinedDefinitionsOnly = tools.list(undefined);
const formattedDefinitionsOnly = tools.list({ format: 'openai' });
const noListArguments: Parameters<UserScopeTools['list']> = [];
const undefinedListArguments: Parameters<UserScopeTools['list']> = [undefined];

// @ts-expect-error Adapter-aware listing always gets MCP definitions from adapter.format.
tools.list({ adapter, format: 'openai' });
// @ts-expect-error A user-scoped adapter call cannot override the bound external user ID.
tools.list({ adapter, externalUserId: 'other-user' });

const widenedAdapterFormat = { adapter, format: 'openai' as const };
const widenedAdapterIdentity = { adapter, externalUserId: 'other-user' };
// @ts-expect-error Widened adapter options cannot override the adapter's MCP format.
tools.list(widenedAdapterFormat);
// @ts-expect-error Widened adapter options cannot override the bound external user ID.
tools.list(widenedAdapterIdentity);

const serviceId: string = definition.serviceId;

// @ts-expect-error Adapter build receives a readonly definitions array.
buildContext.tools.push(definition);
// @ts-expect-error Adapter build receives readonly definitions.
buildContext.tools[0].name = 'tampered_tool';
// @ts-expect-error Adapter build receives a readonly input schema.
buildContext.tools[0].inputSchema.type = 'array';

void inferred;
void definitionsOnly;
void undefinedDefinitionsOnly;
void formattedDefinitionsOnly;
void noListArguments;
void undefinedListArguments;
void serviceId;

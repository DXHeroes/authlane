import { getProviderMcpPolicy } from '@authlane/ai';
import type { Database } from '@authlane/database';
import { isMcpServerId, readMcpServerTools, readProviderTools } from '@authlane/database';
import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import {
  DEMO_SERVICE_ID,
  discoveredToolsToIntegration,
  getToolRisk,
  IntegrationRegistry,
  type IntegrationTools,
  mergeProviderTools,
} from '@authlane/shared';

type PublicToolDefinitions =
  (typeof publicToolDefinitionsByService)[keyof typeof publicToolDefinitionsByService];

// The turnkey demo provider authenticates but ships no tools. It contributes an empty set so a
// demo connection does not fail the caller's whole tool listing.
const NO_TOOL_DEFINITIONS = [] as unknown as PublicToolDefinitions;

function resolveToolDefinitions(serviceId: string): PublicToolDefinitions {
  if (serviceId === DEMO_SERVICE_ID) return NO_TOOL_DEFINITIONS;
  if (!Object.hasOwn(publicToolDefinitionsByService, serviceId)) {
    throw new Error(`Integration contract is not installed: ${serviceId}`);
  }
  return publicToolDefinitionsByService[serviceId as keyof typeof publicToolDefinitionsByService];
}

type ToolDefinition = PublicToolDefinitions[number];

function builtInIntegration(
  serviceId: string,
  discovered: readonly ToolDefinition[] = []
): IntegrationTools {
  const definitions = [
    ...resolveToolDefinitions(serviceId),
    ...discovered,
  ] as PublicToolDefinitions;
  return {
    getTools(format) {
      if (format === 'mcp') {
        return {
          tools: definitions.map(({ serviceId: _serviceId, ...definition }) => definition),
        };
      }
      return {
        functions: definitions.map(
          ({ serviceId, name, description, inputSchema, annotations }) => ({
            name,
            description,
            parameters: inputSchema,
            metadata: {
              authlane: {
                serviceId,
                risk: getToolRisk(annotations),
                annotations,
              },
            },
          })
        ),
      };
    },
  };
}

/** Registry over the compiled catalog only. Used where no tenant database is in scope. */
export const integrationRegistry = new IntegrationRegistry(async (serviceId) =>
  builtInIntegration(serviceId)
);

/**
 * Registry that also resolves a tenant's own MCP servers.
 *
 * Tenant contracts live in the database and change whenever discovery runs, so callers must
 * `invalidate(serverId)` after a refresh. Reads happen under the caller's tenant context, so RLS
 * keeps one organization's contract out of another's tool listing.
 */
export function createIntegrationRegistry(
  db: Database,
  organizationId?: string
): IntegrationRegistry {
  return new IntegrationRegistry(async (serviceId) => {
    if (isMcpServerId(serviceId)) {
      return discoveredToolsToIntegration(await readMcpServerTools(db, serviceId));
    }
    return builtInIntegration(serviceId, await providerAdditions(db, organizationId, serviceId));
  }, organizationId);
}

/**
 * Tools the provider's own MCP server offers beyond Authlane's contract.
 *
 * Read from the database, never from the provider: the listing path issues no credentials, and the
 * worker keeps this table current. A service with no discovery yet, or one whose last discovery
 * failed, simply contributes nothing and the contract stands on its own.
 */
async function providerAdditions(
  db: Database,
  organizationId: string | undefined,
  serviceId: string
): Promise<ToolDefinition[]> {
  const policy = getProviderMcpPolicy(serviceId);
  if (!organizationId || !policy) return [];

  const discovered = await readProviderTools(db, organizationId, serviceId);
  if (discovered.length === 0) return [];

  const declared = resolveToolDefinitions(serviceId) as readonly ToolDefinition[];
  const merged = mergeProviderTools(
    declared.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      annotations: tool.annotations,
    })),
    discovered,
    policy.prefixes
  );

  return merged
    .slice(declared.length)
    .map((tool) => ({ ...tool, serviceId }) as unknown as ToolDefinition);
}

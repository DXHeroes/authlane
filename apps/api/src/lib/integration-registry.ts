import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import type { Database } from '@authlane/database';
import { isMcpServerId, readMcpServerTools } from '@authlane/database';
import {
  DEMO_SERVICE_ID,
  discoveredToolsToIntegration,
  getToolRisk,
  type IntegrationTools,
  IntegrationRegistry,
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

function builtInIntegration(serviceId: string): IntegrationTools {
  const definitions = resolveToolDefinitions(serviceId);
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
export function createIntegrationRegistry(db: Database): IntegrationRegistry {
  return new IntegrationRegistry(async (serviceId) => {
    if (isMcpServerId(serviceId)) {
      return discoveredToolsToIntegration(await readMcpServerTools(db, serviceId));
    }
    return builtInIntegration(serviceId);
  });
}

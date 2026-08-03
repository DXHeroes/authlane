import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import { DEMO_SERVICE_ID, getToolRisk, IntegrationRegistry } from '@authlane/shared';

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

export const integrationRegistry = new IntegrationRegistry(async (serviceId) => {
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
});

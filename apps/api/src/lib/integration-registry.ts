import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import { IntegrationRegistry } from '@authlane/shared';

export const integrationRegistry = new IntegrationRegistry(async (serviceId) => {
  if (!Object.hasOwn(publicToolDefinitionsByService, serviceId)) {
    throw new Error(`Integration contract is not installed: ${serviceId}`);
  }

  const definitions =
    publicToolDefinitionsByService[serviceId as keyof typeof publicToolDefinitionsByService];
  return {
    getTools(format) {
      if (format === 'mcp') {
        return {
          tools: definitions.map(({ serviceId: _serviceId, ...definition }) => definition),
        };
      }
      return {
        functions: definitions.map(({ name, description, inputSchema }) => ({
          name,
          description,
          parameters: inputSchema,
        })),
      };
    },
  };
});

import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import { createProviderMcpOnlyTools } from '@authlane/shared';

export const tools = createProviderMcpOnlyTools(publicToolDefinitionsByService.attio);

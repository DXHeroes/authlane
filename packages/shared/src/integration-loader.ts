/**
 * Integration Tools Loader
 * Dynamically loads tool definitions from integration packages
 */

import type { ToolFormat } from './types.js';

export interface IntegrationTools {
  getTools: (format: ToolFormat) => {
    tools?: unknown[];
    functions?: unknown[];
  };
}

/**
 * Dynamically loads tools from an integration package
 * @param serviceId - The service ID (e.g., 'github', 'slack')
 * @param format - The tool format ('mcp' or 'openai')
 * @returns Tool definitions in the specified format
 */
export async function loadIntegrationTools(
  serviceId: string,
  format: ToolFormat
): Promise<{ tools?: unknown[]; functions?: unknown[] }> {
  try {
    // Try to load the integration using the package name first (for monorepo)
    let integration: IntegrationTools;

    try {
      integration = (await import(
        `@authlane/integration-${serviceId}/tools.js`
      )) as IntegrationTools;
    } catch {
      // Fallback to relative path (for development)
      const integrationPath = `../../../../integrations/${serviceId}/tools.js`;
      integration = (await import(integrationPath)) as IntegrationTools;
    }

    if (!integration.getTools || typeof integration.getTools !== 'function') {
      throw new Error(`Integration ${serviceId} does not export a getTools function`);
    }

    return integration.getTools(format);
  } catch (error) {
    // If the integration doesn't exist or fails to load, return empty tools
    console.warn(`Failed to load integration tools for ${serviceId}:`, error);
    return format === 'mcp' ? { tools: [] } : { functions: [] };
  }
}

/**
 * Loads tools for multiple services and merges them
 * @param serviceIds - Array of service IDs
 * @param format - The tool format ('mcp' or 'openai')
 * @returns Merged tool definitions
 */
export async function loadMultipleIntegrationTools(
  serviceIds: string[],
  format: ToolFormat
): Promise<{ tools?: unknown[]; functions?: unknown[] }> {
  const allToolsPromises = serviceIds.map((serviceId) => loadIntegrationTools(serviceId, format));

  const allToolsResults = await Promise.all(allToolsPromises);

  // Merge all tools
  if (format === 'mcp') {
    const tools = allToolsResults.flatMap((result) => result.tools || []);
    return { tools };
  } else {
    const functions = allToolsResults.flatMap((result) => result.functions || []);
    return { functions };
  }
}

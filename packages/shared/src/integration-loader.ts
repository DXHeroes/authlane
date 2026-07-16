import type { ToolFormat } from './types.js';

export interface IntegrationTools {
  getTools?: (format: ToolFormat) => {
    tools?: unknown[];
    functions?: unknown[];
  };
  tools?: Record<
    string,
    {
      definition: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      };
    }
  >;
}

export type IntegrationModuleLoader = (serviceId: string) => Promise<IntegrationTools>;

interface RegistryEntry {
  mcp: { tools: unknown[] };
  openai: { functions: unknown[] };
}

function hashDefinitions(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class IntegrationRegistry {
  private readonly entries = new Map<string, Promise<RegistryEntry>>();

  constructor(private readonly loader: IntegrationModuleLoader) {}

  async warm(serviceIds: string[]): Promise<void> {
    await Promise.all([...new Set(serviceIds)].map((serviceId) => this.loadEntry(serviceId)));
  }

  async getTools(
    serviceIds: string[],
    format: ToolFormat
  ): Promise<{ tools?: unknown[]; functions?: unknown[] }> {
    const entries = await Promise.all(serviceIds.map((serviceId) => this.loadEntry(serviceId)));

    if (format === 'mcp') {
      return { tools: entries.flatMap((entry) => entry.mcp.tools) };
    }

    return { functions: entries.flatMap((entry) => entry.openai.functions) };
  }

  async getVersion(serviceIds: string[], format: ToolFormat): Promise<string> {
    return hashDefinitions(await this.getTools(serviceIds, format));
  }

  private loadEntry(serviceId: string): Promise<RegistryEntry> {
    const existing = this.entries.get(serviceId);
    if (existing) {
      return existing;
    }

    const loading = this.loader(serviceId).then((integration) => {
      if (integration.getTools) {
        return {
          mcp: { tools: integration.getTools('mcp').tools ?? [] },
          openai: { functions: integration.getTools('openai').functions ?? [] },
        };
      }

      const definitions = Object.values(integration.tools ?? {}).map((tool) => tool.definition);
      return {
        mcp: { tools: definitions },
        openai: {
          functions: definitions.map(({ name, description, inputSchema }) => ({
            name,
            description,
            parameters: inputSchema,
          })),
        },
      };
    });
    this.entries.set(serviceId, loading);
    return loading;
  }
}

import { getToolRisk } from './tool-safety.js';
import type { ToolAccessPolicy, ToolFormat } from './types.js';

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
        annotations: {
          readOnlyHint: boolean;
          destructiveHint: boolean;
          idempotentHint: boolean;
          openWorldHint: boolean;
        };
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

  /**
   * @param scope Confines the cache to one tenant.
   *
   * A built-in service id such as `github` is the same string for every organization, but its tool
   * list is not: a provider MCP catalogue is discovered per organization. Without a scope, the first
   * organization to list its tools would fill the cache for all of them.
   */
  constructor(
    private readonly loader: IntegrationModuleLoader,
    private readonly scope?: string
  ) {}

  private cacheKey(serviceId: string): string {
    // A NUL separator cannot occur in either half, so no pair of values can collide.
    return this.scope ? `${this.scope}\u0000${serviceId}` : serviceId;
  }

  async warm(serviceIds: string[]): Promise<void> {
    await Promise.all([...new Set(serviceIds)].map((serviceId) => this.loadEntry(serviceId)));
  }

  /**
   * Forgets a cached contract so the next read reloads it.
   *
   * Built-in integrations are compiled in and never change at runtime, which is why the cache is
   * otherwise permanent. A tenant's MCP server rediscovers its tools on a schedule, so without
   * this the registry would serve the contract captured at boot forever.
   */
  invalidate(serviceId: string): void {
    this.entries.delete(this.cacheKey(serviceId));
  }

  async getTools(
    serviceIds: string[],
    format: ToolFormat,
    toolAccessPolicies: Readonly<Record<string, ToolAccessPolicy>> = {}
  ): Promise<{ tools?: unknown[]; functions?: unknown[] }> {
    const entries = await Promise.all(
      serviceIds.map(async (serviceId) => ({
        entry: await this.loadEntry(serviceId),
        policy: toolAccessPolicies[serviceId] ?? 'full',
      }))
    );

    if (format === 'mcp') {
      return {
        tools: entries.flatMap(({ entry, policy }) =>
          policy === 'full'
            ? entry.mcp.tools
            : entry.mcp.tools.filter((tool) => hasReadOnlyAnnotation(tool))
        ),
      };
    }

    return {
      functions: entries.flatMap(({ entry, policy }) =>
        policy === 'full'
          ? entry.openai.functions
          : entry.openai.functions.filter((tool) => hasReadOnlyAnnotation(tool))
      ),
    };
  }

  async getVersion(
    serviceIds: string[],
    format: ToolFormat,
    toolAccessPolicies: Readonly<Record<string, ToolAccessPolicy>> = {}
  ): Promise<string> {
    return hashDefinitions(await this.getTools(serviceIds, format, toolAccessPolicies));
  }

  private loadEntry(serviceId: string): Promise<RegistryEntry> {
    const key = this.cacheKey(serviceId);
    const existing = this.entries.get(key);
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
          functions: definitions.map(({ name, description, inputSchema, annotations }) => ({
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
          })),
        },
      };
    });
    this.entries.set(key, loading);
    return loading;
  }
}

function hasReadOnlyAnnotation(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const directAnnotations = Reflect.get(value, 'annotations');
  if (directAnnotations && typeof directAnnotations === 'object') {
    return (
      Reflect.get(directAnnotations, 'readOnlyHint') === true &&
      Reflect.get(directAnnotations, 'destructiveHint') === false
    );
  }
  const metadata = Reflect.get(value, 'metadata');
  if (!metadata || typeof metadata !== 'object') return false;
  const authlane = Reflect.get(metadata, 'authlane');
  if (!authlane || typeof authlane !== 'object') return false;
  const annotations = Reflect.get(authlane, 'annotations');
  return Boolean(
    annotations &&
      typeof annotations === 'object' &&
      Reflect.get(annotations, 'readOnlyHint') === true &&
      Reflect.get(annotations, 'destructiveHint') === false
  );
}

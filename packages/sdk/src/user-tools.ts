import { ErrorCodes, Errors } from './errors.js';
import type { CapabilitiesResource } from './resources/capabilities.js';
import type { CredentialLeasesResource } from './resources/credential-leases.js';
import type { ToolsResource } from './resources/tools.js';
import type {
  CredentialLease,
  MCPTool,
  OpenAIFunction,
  Result,
  ToolsResponse,
  UserScopeToolOptions,
} from './types.js';

export interface UserToolDefinition extends MCPTool {
  serviceId: string;
}

export interface UserToolAdapter<T> {
  format: 'mcp';
  build(context: {
    externalUserId: string;
    tools: UserToolDefinition[];
    execute: (
      serviceId: string,
      toolName: string,
      input: Record<string, unknown>
    ) => Promise<unknown>;
  }): T;
  execute(input: {
    externalUserId: string;
    serviceId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    credential: CredentialLease;
  }): Promise<Result<unknown>>;
}

export type UserToolAdapterOptions<T> = {
  adapter: UserToolAdapter<T>;
  format?: never;
  externalUserId?: never;
};

interface UserToolsResources {
  tools: ToolsResource;
  capabilities: CapabilitiesResource;
  credentialLeases: CredentialLeasesResource;
}

type RunUserOperation = <T>(operation: () => Promise<Result<T>>) => Promise<Result<T>>;

interface ToolErrorResult {
  error: {
    code: string;
    message: string;
  };
}

const toolError = (code: string, message: string): ToolErrorResult => ({
  error: { code, message },
});

const isMcpTool = (tool: MCPTool | OpenAIFunction): tool is MCPTool => 'inputSchema' in tool;

export class UserToolsResource {
  constructor(
    private readonly externalUserId: string,
    private readonly resources: UserToolsResources,
    private readonly run: RunUserOperation
  ) {}

  list<T>(options: UserToolAdapterOptions<T>): Promise<Result<T>>;
  list(): Promise<Result<ToolsResponse>>;
  list(options: UserScopeToolOptions): Promise<Result<ToolsResponse>>;
  list<T>(
    options: UserScopeToolOptions | UserToolAdapterOptions<T> = {}
  ): Promise<Result<ToolsResponse | T>> {
    if ('adapter' in options) {
      return this.run(() => this.listWithAdapter(options.adapter));
    }
    return this.run(() =>
      this.resources.tools.list({ externalUserId: this.externalUserId, format: options.format })
    );
  }

  private async listWithAdapter<T>(adapter: UserToolAdapter<T>): Promise<Result<T>> {
    const capabilities = await this.resources.capabilities.get({
      externalUserId: this.externalUserId,
      format: adapter.format,
    });
    if (capabilities.error) {
      return { data: null, error: capabilities.error };
    }

    const tools = capabilities.data.services.flatMap((service) =>
      service.connected
        ? service.tools.filter(isMcpTool).map((tool) => ({ ...tool, serviceId: service.serviceId }))
        : []
    );
    const allowlist = new Map<string, Set<string>>();
    for (const tool of tools) {
      const serviceTools = allowlist.get(tool.serviceId) ?? new Set<string>();
      serviceTools.add(tool.name);
      allowlist.set(tool.serviceId, serviceTools);
    }

    let executionEnabled = false;
    const execute = async (
      serviceId: string,
      toolName: string,
      input: Record<string, unknown>
    ): Promise<unknown> => {
      if (!executionEnabled) {
        return toolError(
          ErrorCodes.TOOL_NOT_AVAILABLE,
          'Tool execution is not available during adapter build.'
        );
      }
      if (!allowlist.get(serviceId)?.has(toolName)) {
        return toolError(ErrorCodes.TOOL_NOT_AVAILABLE, 'Tool is not available for this user.');
      }

      const lease = await this.resources.credentialLeases.create({
        externalUserId: this.externalUserId,
        serviceId,
      });
      if (lease.error) {
        return toolError(
          ErrorCodes.CREDENTIAL_LEASE_ERROR,
          'Credential lease could not be issued.'
        );
      }

      try {
        const result = await adapter.execute({
          externalUserId: this.externalUserId,
          serviceId,
          toolName,
          arguments: input,
          credential: lease.data,
        });
        if (result.error) {
          return toolError(ErrorCodes.ADAPTER_ERROR, 'Tool execution failed.');
        }
        return result.data;
      } catch {
        return toolError(ErrorCodes.ADAPTER_ERROR, 'Tool execution failed.');
      }
    };

    try {
      const data = adapter.build({
        externalUserId: this.externalUserId,
        tools,
        execute,
      });
      executionEnabled = true;
      return { data, error: null };
    } catch {
      return { data: null, error: Errors.adapterError() };
    }
  }
}

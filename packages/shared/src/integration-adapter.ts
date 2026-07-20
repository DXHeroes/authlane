import { createError } from './errors.js';
import type {
  CredentialMaterial,
  IntegrationAdapter,
  OAuth2Credentials,
  ToolHandler,
} from './types.js';

function toHandlerCredentials(credential: CredentialMaterial): OAuth2Credentials | null {
  if (credential.type !== 'oauth2') return null;
  return {
    access_token: credential.accessToken,
    token_type: credential.tokenType,
    scope: credential.scopes.join(' '),
    expires_at: credential.expiresAt ?? undefined,
    metadata: credential.providerContext
      ? { api_base_url: credential.providerContext.apiBaseUrl }
      : undefined,
  };
}

export function createIntegrationAdapter(
  serviceId: string,
  tools: Record<string, ToolHandler>
): IntegrationAdapter {
  return {
    serviceId,
    definitions: Object.values(tools).map((tool) => ({
      ...tool.definition,
      serviceId,
    })),
    async execute(toolName, input, credential) {
      const tool = tools[toolName];
      if (!tool) {
        return {
          data: null,
          error: createError(`Unknown ${serviceId} tool: ${toolName}`, 'TOOL_NOT_FOUND'),
        };
      }
      const handlerCredentials = toHandlerCredentials(credential);
      if (!handlerCredentials) {
        return {
          data: null,
          error: createError(
            `${serviceId} requires OAuth2 credential material`,
            'CREDENTIAL_TYPE_UNSUPPORTED'
          ),
        };
      }
      try {
        return { data: await tool.handler(input, handlerCredentials), error: null };
      } catch (error) {
        return {
          data: null,
          error: createError(
            error instanceof Error ? error.message : `${serviceId} request failed`,
            'PROVIDER_REQUEST_FAILED'
          ),
        };
      }
    },
  };
}

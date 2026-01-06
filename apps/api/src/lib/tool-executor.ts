/**
 * Tool Executor
 * Executes integration tools with credential injection and validation
 */

import type { Database } from '@authlane/database';
import { auditLogs } from '@authlane/database';
import { Errors, type OAuth2Credentials, type Result } from '@authlane/shared';
import { getCredentials } from './credential-injector.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolHandler {
  definition: ToolDefinition;
  handler: (params: Record<string, unknown>, credentials: OAuth2Credentials) => Promise<unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

/**
 * Load tool definition and handler from integration
 *
 * @param toolName - Full tool name (e.g., 'github_create_issue')
 * @returns Tool definition and handler
 */
async function loadTool(toolName: string): Promise<Result<ToolHandler>> {
  try {
    // Extract service ID from tool name (e.g., 'github' from 'github_create_issue')
    const serviceId = toolName.split('_')[0];

    if (!serviceId) {
      return {
        data: null,
        error: Errors.validationError(
          'Invalid tool name format',
          'Expected format: service_toolname'
        ),
      };
    }

    // Dynamically import integration tools
    try {
      const integrationPath = `../../../../integrations/${serviceId}/tools.js`;
      const integration = await import(integrationPath);

      // Check if integration exports a tools object with handlers
      if (!integration.tools || typeof integration.tools !== 'object') {
        return {
          data: null,
          error: Errors.internalError(`Integration '${serviceId}' does not export tools`),
        };
      }

      // Get the specific tool
      const tool = integration.tools[toolName];
      if (!tool) {
        return {
          data: null,
          error: Errors.notFound('Tool', toolName),
        };
      }

      // Validate tool structure
      if (!tool.definition || !tool.handler) {
        return {
          data: null,
          error: Errors.internalError(`Tool '${toolName}' is missing definition or handler`),
        };
      }

      return {
        data: tool as ToolHandler,
        error: null,
      };
    } catch (importError) {
      console.error(`Failed to import integration '${serviceId}':`, importError);
      return {
        data: null,
        error: Errors.notFound('Integration', serviceId),
      };
    }
  } catch (error) {
    console.error('Failed to load tool:', error);
    return {
      data: null,
      error: Errors.internalError('Failed to load tool'),
    };
  }
}

/**
 * Validate parameters against tool schema
 *
 * @param params - Parameters to validate
 * @param schema - JSON Schema
 * @returns Validation result
 */
function validateParameters(
  params: Record<string, unknown>,
  schema: ToolDefinition['inputSchema']
): Result<true> {
  // Basic validation: check required fields
  const required = schema.required || [];

  for (const field of required) {
    if (!(field in params) || params[field] === undefined || params[field] === null) {
      return {
        data: null,
        error: Errors.validationError(
          `Missing required parameter: ${field}`,
          `The tool requires parameter '${field}'`
        ),
      };
    }
  }

  // TODO: Add full JSON Schema validation using a library like Ajv
  // For now, just check required fields

  return {
    data: true,
    error: null,
  };
}

/**
 * Redact sensitive parameters for audit logging
 *
 * @param params - Parameters to redact
 * @returns Redacted parameters safe for logging
 */
function redactParameters(params: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'api_key',
    'apikey',
    'access_token',
    'refresh_token',
    'private_key',
    'ssh_key',
    'credentials',
  ];

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sensitiveKey) => keyLower.includes(sensitiveKey));

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactParameters(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Execute a tool with credential injection
 *
 * @param userId - User ID
 * @param toolName - Tool name (e.g., 'github_create_issue')
 * @param parameters - Tool parameters
 * @param db - Database instance
 * @returns Execution result
 */
export async function executeTool(
  userId: string,
  toolName: string,
  parameters: Record<string, unknown>,
  db: Database
): Promise<Result<unknown>> {
  const startTime = Date.now();

  try {
    // 1. Load tool definition and handler
    const toolResult = await loadTool(toolName);
    if (toolResult.error) {
      return { data: null, error: toolResult.error };
    }

    if (!toolResult.data) {
      return { data: null, error: Errors.internalError('Tool data not found') };
    }
    const tool = toolResult.data;

    // 2. Validate parameters
    const validation = validateParameters(parameters, tool.definition.inputSchema);
    if (validation.error) {
      return { data: null, error: validation.error };
    }

    // 3. Get service ID from tool name
    const serviceId = toolName.split('_')[0] || toolName;

    // 4. Load and decrypt user credentials
    const credResult = await getCredentials(userId, serviceId, db);
    if (credResult.error) {
      return { data: null, error: credResult.error };
    }

    if (!credResult.data) {
      return { data: null, error: Errors.internalError('Credentials data not found') };
    }
    const { credentials } = credResult.data;

    // 5. Execute tool handler with credentials
    let result: unknown;
    let executionError: Error | null = null;

    try {
      result = await Promise.race([
        tool.handler(parameters, credentials),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
        ),
      ]);
    } catch (handlerError) {
      console.error(`Tool handler failed: ${toolName}`, handlerError);
      executionError = handlerError instanceof Error ? handlerError : new Error('Unknown error');
    }

    const executionTime = Date.now() - startTime;

    // 6. Log execution to audit trail
    try {
      await db.insert(auditLogs).values({
        userId,
        organizationId: credResult.data?.connection.organizationId || 'unknown',
        toolName,
        serviceId,
        parametersRedacted: redactParameters(parameters),
        resultStatus: executionError ? 'error' : 'success',
        errorMessage: executionError?.message,
        executionTimeMs: executionTime,
      });
    } catch (auditError) {
      console.error('Failed to log audit trail:', auditError);
      // Don't fail the tool execution if audit logging fails
    }

    // 7. Return result
    if (executionError) {
      return {
        data: null,
        error: Errors.internalError(`Tool execution failed: ${executionError.message}`),
      };
    }

    console.log(`Tool executed: ${toolName}, time: ${executionTime}ms`);
    return {
      data: result,
      error: null,
    };
  } catch (error) {
    console.error('Tool execution error:', error);
    return {
      data: null,
      error: Errors.internalError('Tool execution failed'),
    };
  }
}

/**
 * Execute a tool with organization-level credentials
 *
 * @param organizationId - Organization ID
 * @param toolName - Tool name
 * @param parameters - Tool parameters
 * @param db - Database instance
 * @returns Execution result
 */
export async function executeToolForOrganization(
  _organizationId: string,
  _toolName: string,
  _parameters: Record<string, unknown>,
  _db: Database
): Promise<Result<unknown>> {
  // TODO: Implement organization-level tool execution
  // Similar to executeTool but uses getOrganizationCredentials
  return {
    data: null,
    error: Errors.internalError('Organization tool execution not yet implemented'),
  };
}

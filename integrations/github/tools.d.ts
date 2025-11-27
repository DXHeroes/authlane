/**
 * GitHub integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */
import type { ToolFormat } from '@authlane/shared';
export interface GitHubTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}
/**
 * Converts tools to MCP format
 */
export declare function getToolsMCP(): {
  tools: GitHubTool[];
};
/**
 * Converts tools to OpenAI function calling format
 */
export declare function getToolsOpenAI(): {
  functions: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
};
/**
 * Gets tools in the specified format
 */
export declare function getTools(format: ToolFormat):
  | {
      tools: GitHubTool[];
    }
  | {
      functions: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      }>;
    };
//# sourceMappingURL=tools.d.ts.map

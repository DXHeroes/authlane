#!/usr/bin/env node
/**
 * Authlane MCP Server
 * Exposes Authlane tools to AI frameworks via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createAuthlaneClient } from './client.js';
import { executeTool } from './tool-executor.js';

/**
 * Configuration schema for the MCP server
 */
const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'AUTHLANE_API_KEY is required'),
  baseUrl: z.string().url().optional(),
  userId: z.string().min(1, 'AUTHLANE_USER_ID is required'),
});

type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
function loadConfig(): Config {
  // In development mode, use defaults if not set
  const isDev = process.env.NODE_ENV !== 'production';
  const defaultBaseUrl = process.env.AUTHLANE_BASE_URL || 'http://localhost:3000';
  
  const config = {
    apiKey: process.env.AUTHLANE_API_KEY || (isDev ? 'test_api_key_dev' : ''),
    baseUrl: defaultBaseUrl,
    userId: process.env.AUTHLANE_USER_ID || (isDev ? 'test_user_dev' : ''),
  };

  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Configuration error:\n${messages}`);
    }
    throw error;
  }
}

/**
 * Main server function
 */
async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    // Create Authlane client
    const authlane = createAuthlaneClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });

    // Create MCP server
    const server = new Server(
      {
        name: 'authlane-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
      try {
        // Fetch tools from Authlane API
        const { data, error } = await authlane.tools.list({
          userId: config.userId,
          format: 'mcp',
        });

        if (error) {
          console.error('Error fetching tools:', error);
          return { tools: [] };
        }

        // Return tools in MCP format
        return {
          tools: data?.tools || [],
        };
      } catch (error) {
        console.error('Error in ListTools handler:', error);
        return { tools: [] };
      }
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      try {
        const { name, arguments: args } = request.params;

        // Execute the tool via Authlane API
        const result = await executeTool(authlane, {
          userId: config.userId,
          toolName: name,
          arguments: args || {},
        });

        if (result.error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: result.error.message,
                  code: result.error.code,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result.data),
            },
          ],
        };
      } catch (error) {
        console.error('Error in CallTool handler:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('Authlane MCP server running on stdio');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run the server only if not in dev mode or if explicitly configured
// MCP server is designed for stdio transport (Claude Desktop), not dev server
const isDev = process.env.NODE_ENV !== 'production';
const hasConfig = process.env.AUTHLANE_API_KEY && process.env.AUTHLANE_USER_ID;

if (!isDev || hasConfig) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} else {
  // In dev mode without config, just log and exit gracefully
  console.log('⚠️  MCP server skipped in dev mode (requires AUTHLANE_API_KEY and AUTHLANE_USER_ID)');
  console.log('💡 MCP server is designed for stdio transport (Claude Desktop), not dev server');
  console.log('💡 To test MCP server, set environment variables or run it manually');
  process.exit(0);
}

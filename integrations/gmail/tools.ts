/**
 * Gmail integration tool definitions
 * Supports both MCP and OpenAI function calling formats
 */

import type { ToolFormat } from '@authlane/shared';

export interface GmailTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const gmailTools: GmailTool[] = [
  {
    name: 'gmail_send_email',
    description: 'Sends an email via Gmail',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of recipient email addresses',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body content (plain text or HTML)',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of CC recipient email addresses',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of BCC recipient email addresses',
        },
        html: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
          default: false,
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              content: { type: 'string', description: 'Base64 encoded content' },
              mimeType: { type: 'string' },
            },
          },
          description: 'Array of email attachments',
        },
        reply_to: {
          type: 'string',
          description: 'Reply-to email address',
        },
        thread_id: {
          type: 'string',
          description: 'Thread ID to reply to (for continuing email conversations)',
        },
        label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs to apply to the sent message',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_read_emails',
    description: 'Reads emails from Gmail inbox or specific folder',
    inputSchema: {
      type: 'object',
      properties: {
        max_results: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 10, max: 500)',
          default: 10,
          maximum: 500,
        },
        label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs to filter by (e.g., ["INBOX", "UNREAD"])',
        },
        include_spam_trash: {
          type: 'boolean',
          description: 'Include emails from spam and trash (default: false)',
          default: false,
        },
        page_token: {
          type: 'string',
          description: 'Page token for pagination to get next page of results',
        },
        format: {
          type: 'string',
          enum: ['minimal', 'full', 'raw', 'metadata'],
          description: 'Email format to return (default: full)',
          default: 'full',
        },
        metadata_headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'When format is metadata, specify which headers to include (e.g., ["From", "To", "Subject"])',
        },
      },
      required: [],
    },
  },
  {
    name: 'gmail_search_emails',
    description: 'Searches for emails in Gmail using Gmail search syntax',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query (e.g., "from:user@example.com", "subject:meeting", "is:unread after:2024/01/01")',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 10, max: 500)',
          default: 10,
          maximum: 500,
        },
        label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs to filter by',
        },
        include_spam_trash: {
          type: 'boolean',
          description: 'Include emails from spam and trash (default: false)',
          default: false,
        },
        page_token: {
          type: 'string',
          description: 'Page token for pagination to get next page of results',
        },
        format: {
          type: 'string',
          enum: ['minimal', 'full', 'raw', 'metadata'],
          description: 'Email format to return (default: full)',
          default: 'full',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_get_email',
    description: 'Gets a specific email by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Email message ID',
        },
        format: {
          type: 'string',
          enum: ['minimal', 'full', 'raw', 'metadata'],
          description: 'Email format to return (default: full)',
          default: 'full',
        },
        metadata_headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'When format is metadata, specify which headers to include',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_modify_email',
    description: 'Modifies labels on an email (mark as read/unread, archive, star, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Email message ID to modify',
        },
        add_label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs to add (e.g., ["STARRED", "IMPORTANT"])',
        },
        remove_label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs to remove (e.g., ["UNREAD", "INBOX"])',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_delete_email',
    description: 'Deletes an email permanently (not trash, permanent deletion)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Email message ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_trash_email',
    description: 'Moves an email to trash',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Email message ID to trash',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_list_labels',
    description: 'Lists all labels in the Gmail account',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'gmail_create_label',
    description: 'Creates a new label in Gmail',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Label name',
        },
        label_list_visibility: {
          type: 'string',
          enum: ['labelShow', 'labelShowIfUnread', 'labelHide'],
          description: 'Visibility in label list (default: labelShow)',
          default: 'labelShow',
        },
        message_list_visibility: {
          type: 'string',
          enum: ['show', 'hide'],
          description: 'Visibility in message list (default: show)',
          default: 'show',
        },
        background_color: {
          type: 'string',
          description: 'Background color in hex format (e.g., "#000000")',
        },
        text_color: {
          type: 'string',
          description: 'Text color in hex format (e.g., "#ffffff")',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'gmail_get_thread',
    description: 'Gets an email thread by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Thread ID',
        },
        format: {
          type: 'string',
          enum: ['minimal', 'full', 'metadata'],
          description: 'Email format to return for messages in thread (default: full)',
          default: 'full',
        },
        metadata_headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'When format is metadata, specify which headers to include',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_list_drafts',
    description: 'Lists all draft emails',
    inputSchema: {
      type: 'object',
      properties: {
        max_results: {
          type: 'number',
          description: 'Maximum number of drafts to return (default: 10, max: 500)',
          default: 10,
          maximum: 500,
        },
        page_token: {
          type: 'string',
          description: 'Page token for pagination',
        },
      },
      required: [],
    },
  },
  {
    name: 'gmail_create_draft',
    description: 'Creates a draft email',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of recipient email addresses',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body content',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of CC recipient email addresses',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of BCC recipient email addresses',
        },
        html: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
          default: false,
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
];

/**
 * Converts tools to MCP format
 */
export function getToolsMCP(): { tools: GmailTool[] } {
  return { tools: gmailTools };
}

/**
 * Converts tools to OpenAI function calling format
 */
export function getToolsOpenAI(): {
  functions: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
} {
  return {
    functions: gmailTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  };
}

/**
 * Gets tools in the specified format
 */
export function getTools(format: ToolFormat) {
  return format === 'mcp' ? getToolsMCP() : getToolsOpenAI();
}

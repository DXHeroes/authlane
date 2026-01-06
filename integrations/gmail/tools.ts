/**
 * Gmail Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials } from '@authlane/shared';
import type { ToolHandler } from '../../apps/api/src/lib/tool-executor.js';

/**
 * Make Gmail API request with OAuth token
 */
async function gmailRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Gmail API error: ${error.message || response.statusText}`);
  }

  // DELETE requests may return 204 No Content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

/**
 * Create RFC 2822 formatted email message
 */
function createEmailMessage(params: {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  html?: boolean;
  reply_to?: string;
}): string {
  const { to, subject, body, cc, bcc, html, reply_to } = params;

  const headers: string[] = [`To: ${to.join(', ')}`, `Subject: ${subject}`];

  if (cc && cc.length > 0) headers.push(`Cc: ${cc.join(', ')}`);
  if (bcc && bcc.length > 0) headers.push(`Bcc: ${bcc.join(', ')}`);
  if (reply_to) headers.push(`Reply-To: ${reply_to}`);
  if (html) headers.push('Content-Type: text/html; charset=utf-8');

  const message = [...headers, '', body].join('\r\n');

  // Base64url encode
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Gmail Tools
 */
export const tools: Record<string, ToolHandler> = {
  gmail_send_email: {
    definition: {
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
    handler: async (params, credentials) => {
      const {
        to,
        subject,
        body,
        cc,
        bcc,
        html = false,
        reply_to,
        thread_id,
        label_ids,
      } = params as {
        to: string[];
        subject: string;
        body: string;
        cc?: string[];
        bcc?: string[];
        html?: boolean;
        reply_to?: string;
        thread_id?: string;
        label_ids?: string[];
      };

      const raw = createEmailMessage({ to, subject, body, cc, bcc, html, reply_to });

      const message: Record<string, unknown> = { raw };
      if (thread_id) message.threadId = thread_id;
      if (label_ids) message.labelIds = label_ids;

      return gmailRequest('/users/me/messages/send', credentials, {
        method: 'POST',
        body: JSON.stringify(message),
      });
    },
  },

  gmail_read_emails: {
    definition: {
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
            description:
              'When format is metadata, specify which headers to include (e.g., ["From", "To", "Subject"])',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        max_results = 10,
        label_ids,
        include_spam_trash = false,
        page_token,
        format = 'full',
        metadata_headers,
      } = params as {
        max_results?: number;
        label_ids?: string[];
        include_spam_trash?: boolean;
        page_token?: string;
        format?: string;
        metadata_headers?: string[];
      };

      const queryParams: string[] = [`maxResults=${max_results}`];
      if (label_ids) queryParams.push(`labelIds=${label_ids.join('&labelIds=')}`);
      if (include_spam_trash) queryParams.push('includeSpamTrash=true');
      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);

      const listResult = (await gmailRequest(
        `/users/me/messages?${queryParams.join('&')}`,
        credentials
      )) as {
        messages?: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
      };

      if (!listResult.messages || listResult.messages.length === 0) {
        return { messages: [], nextPageToken: listResult.nextPageToken };
      }

      // Fetch full message details
      const messages = await Promise.all(
        listResult.messages.map(async (msg) => {
          const detailParams: string[] = [`format=${format}`];
          if (format === 'metadata' && metadata_headers) {
            metadata_headers.forEach((header) => detailParams.push(`metadataHeaders=${header}`));
          }
          return gmailRequest(
            `/users/me/messages/${msg.id}?${detailParams.join('&')}`,
            credentials
          );
        })
      );

      return { messages, nextPageToken: listResult.nextPageToken };
    },
  },

  gmail_search_emails: {
    definition: {
      name: 'gmail_search_emails',
      description: 'Searches for emails in Gmail using Gmail search syntax',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Gmail search query (e.g., "from:user@example.com", "subject:meeting", "is:unread after:2024/01/01")',
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
    handler: async (params, credentials) => {
      const {
        query,
        max_results = 10,
        label_ids,
        include_spam_trash = false,
        page_token,
        format = 'full',
      } = params as {
        query: string;
        max_results?: number;
        label_ids?: string[];
        include_spam_trash?: boolean;
        page_token?: string;
        format?: string;
      };

      const queryParams: string[] = [`q=${encodeURIComponent(query)}`, `maxResults=${max_results}`];
      if (label_ids) queryParams.push(`labelIds=${label_ids.join('&labelIds=')}`);
      if (include_spam_trash) queryParams.push('includeSpamTrash=true');
      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);

      const searchResult = (await gmailRequest(
        `/users/me/messages?${queryParams.join('&')}`,
        credentials
      )) as {
        messages?: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
      };

      if (!searchResult.messages || searchResult.messages.length === 0) {
        return { messages: [], nextPageToken: searchResult.nextPageToken };
      }

      // Fetch full message details
      const messages = await Promise.all(
        searchResult.messages.map(async (msg) =>
          gmailRequest(`/users/me/messages/${msg.id}?format=${format}`, credentials)
        )
      );

      return { messages, nextPageToken: searchResult.nextPageToken };
    },
  },

  gmail_get_email: {
    definition: {
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
    handler: async (params, credentials) => {
      const {
        id,
        format = 'full',
        metadata_headers,
      } = params as {
        id: string;
        format?: string;
        metadata_headers?: string[];
      };

      const queryParams: string[] = [`format=${format}`];
      if (format === 'metadata' && metadata_headers) {
        metadata_headers.forEach((header) => queryParams.push(`metadataHeaders=${header}`));
      }

      return gmailRequest(`/users/me/messages/${id}?${queryParams.join('&')}`, credentials);
    },
  },

  gmail_modify_email: {
    definition: {
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
    handler: async (params, credentials) => {
      const { id, add_label_ids, remove_label_ids } = params as {
        id: string;
        add_label_ids?: string[];
        remove_label_ids?: string[];
      };

      const body: Record<string, unknown> = {};
      if (add_label_ids) body.addLabelIds = add_label_ids;
      if (remove_label_ids) body.removeLabelIds = remove_label_ids;

      return gmailRequest(`/users/me/messages/${id}/modify`, credentials, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  },

  gmail_delete_email: {
    definition: {
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
    handler: async (params, credentials) => {
      const { id } = params as { id: string };

      return gmailRequest(`/users/me/messages/${id}`, credentials, {
        method: 'DELETE',
      });
    },
  },

  gmail_trash_email: {
    definition: {
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
    handler: async (params, credentials) => {
      const { id } = params as { id: string };

      return gmailRequest(`/users/me/messages/${id}/trash`, credentials, {
        method: 'POST',
      });
    },
  },

  gmail_list_labels: {
    definition: {
      name: 'gmail_list_labels',
      description: 'Lists all labels in the Gmail account',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    handler: async (_params, credentials) => {
      return gmailRequest('/users/me/labels', credentials);
    },
  },

  gmail_create_label: {
    definition: {
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
    handler: async (params, credentials) => {
      const {
        name,
        label_list_visibility = 'labelShow',
        message_list_visibility = 'show',
        background_color,
        text_color,
      } = params as {
        name: string;
        label_list_visibility?: string;
        message_list_visibility?: string;
        background_color?: string;
        text_color?: string;
      };

      const label: Record<string, unknown> = {
        name,
        labelListVisibility: label_list_visibility,
        messageListVisibility: message_list_visibility,
      };

      if (background_color && text_color) {
        label.color = {
          backgroundColor: background_color,
          textColor: text_color,
        };
      }

      return gmailRequest('/users/me/labels', credentials, {
        method: 'POST',
        body: JSON.stringify(label),
      });
    },
  },

  gmail_get_thread: {
    definition: {
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
    handler: async (params, credentials) => {
      const {
        id,
        format = 'full',
        metadata_headers,
      } = params as {
        id: string;
        format?: string;
        metadata_headers?: string[];
      };

      const queryParams: string[] = [`format=${format}`];
      if (format === 'metadata' && metadata_headers) {
        metadata_headers.forEach((header) => queryParams.push(`metadataHeaders=${header}`));
      }

      return gmailRequest(`/users/me/threads/${id}?${queryParams.join('&')}`, credentials);
    },
  },

  gmail_list_drafts: {
    definition: {
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
    handler: async (params, credentials) => {
      const { max_results = 10, page_token } = params as {
        max_results?: number;
        page_token?: string;
      };

      const queryParams: string[] = [`maxResults=${max_results}`];
      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);

      return gmailRequest(`/users/me/drafts?${queryParams.join('&')}`, credentials);
    },
  },

  gmail_create_draft: {
    definition: {
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
    handler: async (params, credentials) => {
      const {
        to,
        subject,
        body,
        cc,
        bcc,
        html = false,
      } = params as {
        to: string[];
        subject: string;
        body: string;
        cc?: string[];
        bcc?: string[];
        html?: boolean;
      };

      const raw = createEmailMessage({ to, subject, body, cc, bcc, html });

      return gmailRequest('/users/me/drafts', credentials, {
        method: 'POST',
        body: JSON.stringify({ message: { raw } }),
      });
    },
  },
};

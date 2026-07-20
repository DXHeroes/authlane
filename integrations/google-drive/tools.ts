/**
 * Google Drive Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Google Drive API request with OAuth token
 */
async function gdriveRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://www.googleapis.com/drive/v3${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`Google Drive API error: ${error.message || response.statusText}`);
  }

  // DELETE requests may return 204 No Content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

/**
 * Upload file using simple upload (for small files <5MB)
 */
async function uploadFile(
  metadata: Record<string, unknown>,
  content: string,
  mimeType: string,
  credentials: OAuth2Credentials
): Promise<unknown> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${mimeType}\r\n`,
    'Content-Transfer-Encoding: base64\r\n\r\n',
    content,
    closeDelimiter,
  ].join('');

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`Google Drive upload error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Update file using multipart upload
 */
async function updateFile(
  fileId: string,
  metadata: Record<string, unknown>,
  content: string,
  mimeType: string,
  credentials: OAuth2Credentials
): Promise<unknown> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${mimeType}\r\n`,
    'Content-Transfer-Encoding: base64\r\n\r\n',
    content,
    closeDelimiter,
  ].join('');

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`Google Drive update error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Google Drive Tools
 */
export const tools: Record<string, ToolHandler> = {
  gdrive_list_files: {
    definition: {
      name: 'gdrive_list_files',
      description: 'Lists files and folders in Google Drive with optional filtering and pagination',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search query using Google Drive query syntax (e.g., "name contains \'report\'", "mimeType = \'image/jpeg\'", "\'parent_folder_id\' in parents")',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of files to return (default: 10, max: 1000)',
            default: 10,
            maximum: 1000,
          },
          page_token: {
            type: 'string',
            description: 'Page token for pagination to get next page of results',
          },
          order_by: {
            type: 'string',
            description:
              'Sort order (e.g., "folder,modifiedTime desc,name"). Options: createdTime, folder, modifiedByMeTime, modifiedTime, name, quotaBytesUsed, recency, sharedWithMeTime, starred, viewedByMeTime',
          },
          folder_id: {
            type: 'string',
            description:
              'List files only in this folder (folder ID). If not specified, lists from root or uses query',
          },
          include_trashed: {
            type: 'boolean',
            description: 'Include trashed files in results (default: false)',
            default: false,
          },
          spaces: {
            type: 'string',
            description: 'Comma-separated list of spaces to query (drive, appDataFolder, photos)',
            default: 'drive',
          },
          fields: {
            type: 'string',
            description:
              'Fields to include in response (e.g., "files(id,name,mimeType,size,createdTime)"). If not specified, returns all fields',
          },
          supports_all_drives: {
            type: 'boolean',
            description: 'Include items from all drives (including shared drives) (default: false)',
            default: false,
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        query,
        max_results = 10,
        page_token,
        order_by,
        folder_id,
        include_trashed = false,
        spaces = 'drive',
        fields,
        supports_all_drives = false,
      } = params as {
        query?: string;
        max_results?: number;
        page_token?: string;
        order_by?: string;
        folder_id?: string;
        include_trashed?: boolean;
        spaces?: string;
        fields?: string;
        supports_all_drives?: boolean;
      };

      const queryParams: string[] = [`pageSize=${max_results}`];

      let finalQuery = query || '';
      if (folder_id && !query) {
        finalQuery = `'${folder_id}' in parents`;
      } else if (folder_id) {
        finalQuery = `${query} and '${folder_id}' in parents`;
      }
      if (!include_trashed) {
        finalQuery = finalQuery ? `${finalQuery} and trashed=false` : 'trashed=false';
      }
      if (finalQuery) queryParams.push(`q=${encodeURIComponent(finalQuery)}`);

      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);
      if (order_by) queryParams.push(`orderBy=${encodeURIComponent(order_by)}`);
      if (spaces) queryParams.push(`spaces=${spaces}`);
      if (fields) queryParams.push(`fields=${encodeURIComponent(fields)}`);
      if (supports_all_drives) {
        queryParams.push('supportsAllDrives=true');
        queryParams.push('includeItemsFromAllDrives=true');
      }

      return gdriveRequest(`/files?${queryParams.join('&')}`, credentials);
    },
  },

  gdrive_get_file: {
    definition: {
      name: 'gdrive_get_file',
      description: 'Gets metadata for a specific file or folder by ID',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File or folder ID',
          },
          fields: {
            type: 'string',
            description:
              'Specific fields to retrieve (e.g., "id,name,mimeType,size,owners,permissions"). If not specified, returns all fields',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        file_id,
        fields,
        supports_all_drives = false,
      } = params as {
        file_id: string;
        fields?: string;
        supports_all_drives?: boolean;
      };

      const queryParams: string[] = [];
      if (fields) queryParams.push(`fields=${encodeURIComponent(fields)}`);
      if (supports_all_drives) queryParams.push('supportsAllDrives=true');

      const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      return gdriveRequest(`/files/${file_id}${query}`, credentials);
    },
  },

  gdrive_upload_file: {
    definition: {
      name: 'gdrive_upload_file',
      description: 'Uploads a file to Google Drive',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the file to create',
          },
          content: {
            type: 'string',
            description: 'Base64 encoded file content',
          },
          mime_type: {
            type: 'string',
            description:
              'MIME type of the file (e.g., "text/plain", "image/jpeg", "application/pdf")',
          },
          parent_folder_id: {
            type: 'string',
            description: 'ID of the parent folder. If not specified, uploads to root folder',
          },
          description: {
            type: 'string',
            description: 'Description of the file',
          },
          starred: {
            type: 'boolean',
            description: 'Whether to star the file (default: false)',
            default: false,
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['name', 'content', 'mime_type'],
      },
    },
    handler: async (params, credentials) => {
      const {
        name,
        content,
        mime_type,
        parent_folder_id,
        description,
        starred = false,
      } = params as {
        name: string;
        content: string;
        mime_type: string;
        parent_folder_id?: string;
        description?: string;
        starred?: boolean;
        supports_all_drives?: boolean;
      };

      const metadata: Record<string, unknown> = { name };
      if (parent_folder_id) metadata.parents = [parent_folder_id];
      if (description) metadata.description = description;
      if (starred) metadata.starred = starred;

      return uploadFile(metadata, content, mime_type, credentials);
    },
  },

  gdrive_download_file: {
    definition: {
      name: 'gdrive_download_file',
      description: 'Downloads a file from Google Drive (returns base64 encoded content)',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File ID to download',
          },
          mime_type: {
            type: 'string',
            description:
              'For Google Workspace files (Docs, Sheets, Slides), specify export MIME type (e.g., "application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        file_id,
        mime_type,
        supports_all_drives = false,
      } = params as {
        file_id: string;
        mime_type?: string;
        supports_all_drives?: boolean;
      };

      const endpoint = mime_type
        ? `/files/${file_id}/export?mimeType=${encodeURIComponent(mime_type)}`
        : `/files/${file_id}?alt=media`;

      const queryParam = supports_all_drives ? '&supportsAllDrives=true' : '';

      const response = await fetch(`https://www.googleapis.com/drive/v3${endpoint}${queryParam}`, {
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
        },
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
          message?: string;
          errorMessages?: string[];
        };
        throw new Error(`Google Drive download error: ${error.message || response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      return {
        fileId: file_id,
        content: base64,
        mimeType: mime_type || response.headers.get('content-type'),
        size: buffer.byteLength,
      };
    },
  },

  gdrive_create_folder: {
    definition: {
      name: 'gdrive_create_folder',
      description: 'Creates a new folder in Google Drive',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the folder to create',
          },
          parent_folder_id: {
            type: 'string',
            description: 'ID of the parent folder. If not specified, creates in root folder',
          },
          description: {
            type: 'string',
            description: 'Description of the folder',
          },
          starred: {
            type: 'boolean',
            description: 'Whether to star the folder (default: false)',
            default: false,
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['name'],
      },
    },
    handler: async (params, credentials) => {
      const {
        name,
        parent_folder_id,
        description,
        starred = false,
        supports_all_drives = false,
      } = params as {
        name: string;
        parent_folder_id?: string;
        description?: string;
        starred?: boolean;
        supports_all_drives?: boolean;
      };

      const metadata: Record<string, unknown> = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parent_folder_id) metadata.parents = [parent_folder_id];
      if (description) metadata.description = description;
      if (starred) metadata.starred = starred;

      const query = supports_all_drives ? '?supportsAllDrives=true' : '';

      return gdriveRequest(`/files${query}`, credentials, {
        method: 'POST',
        body: JSON.stringify(metadata),
      });
    },
  },

  gdrive_update_file: {
    definition: {
      name: 'gdrive_update_file',
      description: 'Updates file metadata or content',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File ID to update',
          },
          name: {
            type: 'string',
            description: 'New file name',
          },
          description: {
            type: 'string',
            description: 'New file description',
          },
          content: {
            type: 'string',
            description: 'New file content (base64 encoded). If provided, updates file content',
          },
          mime_type: {
            type: 'string',
            description: 'New MIME type (required if updating content)',
          },
          starred: {
            type: 'boolean',
            description: 'Whether the file is starred',
          },
          trashed: {
            type: 'boolean',
            description: 'Whether the file is in trash',
          },
          add_parents: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of parent folder IDs to add',
          },
          remove_parents: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of parent folder IDs to remove',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        file_id,
        name,
        description,
        content,
        mime_type,
        starred,
        trashed,
        add_parents,
        remove_parents,
        supports_all_drives = false,
      } = params as {
        file_id: string;
        name?: string;
        description?: string;
        content?: string;
        mime_type?: string;
        starred?: boolean;
        trashed?: boolean;
        add_parents?: string[];
        remove_parents?: string[];
        supports_all_drives?: boolean;
      };

      const metadata: Record<string, unknown> = {};
      if (name) metadata.name = name;
      if (description !== undefined) metadata.description = description;
      if (starred !== undefined) metadata.starred = starred;
      if (trashed !== undefined) metadata.trashed = trashed;

      const queryParams: string[] = [];
      if (supports_all_drives) queryParams.push('supportsAllDrives=true');
      if (add_parents) queryParams.push(`addParents=${add_parents.join(',')}`);
      if (remove_parents) queryParams.push(`removeParents=${remove_parents.join(',')}`);

      // If content is provided, use multipart upload
      if (content && mime_type) {
        return updateFile(file_id, metadata, content, mime_type, credentials);
      }

      // Otherwise, just update metadata
      const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      return gdriveRequest(`/files/${file_id}${query}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify(metadata),
      });
    },
  },

  gdrive_delete_file: {
    definition: {
      name: 'gdrive_delete_file',
      description: 'Permanently deletes a file from Google Drive (bypasses trash)',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File or folder ID to delete permanently',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const { file_id, supports_all_drives = false } = params as {
        file_id: string;
        supports_all_drives?: boolean;
      };

      const query = supports_all_drives ? '?supportsAllDrives=true' : '';
      return gdriveRequest(`/files/${file_id}${query}`, credentials, {
        method: 'DELETE',
      });
    },
  },

  gdrive_trash_file: {
    definition: {
      name: 'gdrive_trash_file',
      description: 'Moves a file to trash (can be restored later)',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File or folder ID to move to trash',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const { file_id, supports_all_drives = false } = params as {
        file_id: string;
        supports_all_drives?: boolean;
      };

      const query = supports_all_drives ? '?supportsAllDrives=true' : '';
      return gdriveRequest(`/files/${file_id}${query}`, credentials, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
    },
  },

  gdrive_copy_file: {
    definition: {
      name: 'gdrive_copy_file',
      description: 'Creates a copy of a file',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File ID to copy',
          },
          name: {
            type: 'string',
            description:
              'Name for the copied file. If not specified, uses "Copy of [original name]"',
          },
          parent_folder_id: {
            type: 'string',
            description:
              'ID of the parent folder for the copy. If not specified, copies to same location',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        file_id,
        name,
        parent_folder_id,
        supports_all_drives = false,
      } = params as {
        file_id: string;
        name?: string;
        parent_folder_id?: string;
        supports_all_drives?: boolean;
      };

      const metadata: Record<string, unknown> = {};
      if (name) metadata.name = name;
      if (parent_folder_id) metadata.parents = [parent_folder_id];

      const query = supports_all_drives ? '?supportsAllDrives=true' : '';
      return gdriveRequest(`/files/${file_id}/copy${query}`, credentials, {
        method: 'POST',
        body: JSON.stringify(metadata),
      });
    },
  },

  gdrive_search_files: {
    definition: {
      name: 'gdrive_search_files',
      description:
        'Searches for files using Google Drive query syntax (convenience wrapper for gdrive_list_files with search focus)',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Search query using Drive query syntax (e.g., \"name contains 'report' and mimeType contains 'pdf'\", \"modifiedTime > '2024-01-01T00:00:00'\")",
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results (default: 10, max: 1000)',
            default: 10,
            maximum: 1000,
          },
          order_by: {
            type: 'string',
            description: 'Sort order (e.g., "modifiedTime desc", "name")',
            default: 'modifiedTime desc',
          },
          page_token: {
            type: 'string',
            description: 'Page token for pagination',
          },
          supports_all_drives: {
            type: 'boolean',
            description: 'Include items from all drives (default: false)',
            default: false,
          },
        },
        required: ['query'],
      },
    },
    handler: async (params, credentials) => {
      const {
        query,
        max_results = 10,
        order_by = 'modifiedTime desc',
        page_token,
        supports_all_drives = false,
      } = params as {
        query: string;
        max_results?: number;
        order_by?: string;
        page_token?: string;
        supports_all_drives?: boolean;
      };

      const queryParams: string[] = [
        `q=${encodeURIComponent(query)}`,
        `pageSize=${max_results}`,
        `orderBy=${encodeURIComponent(order_by)}`,
      ];

      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);
      if (supports_all_drives) {
        queryParams.push('supportsAllDrives=true');
        queryParams.push('includeItemsFromAllDrives=true');
      }

      return gdriveRequest(`/files?${queryParams.join('&')}`, credentials);
    },
  },

  gdrive_share_file: {
    definition: {
      name: 'gdrive_share_file',
      description:
        'Creates a permission to share a file or folder with a user or make it publicly accessible',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File or folder ID to share',
          },
          role: {
            type: 'string',
            enum: ['owner', 'organizer', 'fileOrganizer', 'writer', 'commenter', 'reader'],
            description:
              'Permission role (owner, organizer, fileOrganizer, writer, commenter, reader)',
          },
          type: {
            type: 'string',
            enum: ['user', 'group', 'domain', 'anyone'],
            description: 'Type of grantee (user, group, domain, anyone for public)',
          },
          email_address: {
            type: 'string',
            description: 'Email address of user or group (required when type is user or group)',
          },
          domain: {
            type: 'string',
            description: 'Domain name (required when type is domain)',
          },
          send_notification_email: {
            type: 'boolean',
            description: 'Whether to send notification email to the recipient (default: true)',
            default: true,
          },
          email_message: {
            type: 'string',
            description: 'Custom message to include in notification email',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id', 'role', 'type'],
      },
    },
    handler: async (params, credentials) => {
      const {
        file_id,
        role,
        type,
        email_address,
        domain,
        send_notification_email = true,
        email_message,
        supports_all_drives = false,
      } = params as {
        file_id: string;
        role: string;
        type: string;
        email_address?: string;
        domain?: string;
        send_notification_email?: boolean;
        email_message?: string;
        supports_all_drives?: boolean;
      };

      const permission: Record<string, unknown> = { role, type };
      if (email_address) permission.emailAddress = email_address;
      if (domain) permission.domain = domain;

      const queryParams: string[] = [`sendNotificationEmail=${send_notification_email}`];
      if (email_message) queryParams.push(`emailMessage=${encodeURIComponent(email_message)}`);
      if (supports_all_drives) queryParams.push('supportsAllDrives=true');

      return gdriveRequest(`/files/${file_id}/permissions?${queryParams.join('&')}`, credentials, {
        method: 'POST',
        body: JSON.stringify(permission),
      });
    },
  },

  gdrive_list_permissions: {
    definition: {
      name: 'gdrive_list_permissions',
      description: 'Lists all permissions for a file or folder',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File or folder ID',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id'],
      },
    },
    handler: async (params, credentials) => {
      const { file_id, supports_all_drives = false } = params as {
        file_id: string;
        supports_all_drives?: boolean;
      };

      const query = supports_all_drives ? '?supportsAllDrives=true' : '';
      return gdriveRequest(`/files/${file_id}/permissions${query}`, credentials);
    },
  },

  gdrive_remove_permission: {
    definition: {
      name: 'gdrive_remove_permission',
      description: 'Removes a permission from a file or folder',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'File or folder ID',
          },
          permission_id: {
            type: 'string',
            description: 'Permission ID to remove',
          },
          supports_all_drives: {
            type: 'boolean',
            description:
              'Whether the requesting application supports both My Drives and shared drives (default: false)',
            default: false,
          },
        },
        required: ['file_id', 'permission_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        file_id,
        permission_id,
        supports_all_drives = false,
      } = params as {
        file_id: string;
        permission_id: string;
        supports_all_drives?: boolean;
      };

      const query = supports_all_drives ? '?supportsAllDrives=true' : '';
      return gdriveRequest(`/files/${file_id}/permissions/${permission_id}${query}`, credentials, {
        method: 'DELETE',
      });
    },
  },

  gdrive_export_file: {
    definition: {
      name: 'gdrive_export_file',
      description:
        'Exports a Google Workspace document (Docs, Sheets, Slides) to a different format',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'Google Workspace file ID to export',
          },
          mime_type: {
            type: 'string',
            description:
              'Export MIME type (e.g., "application/pdf", "text/plain" for Docs, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" for Sheets)',
          },
        },
        required: ['file_id', 'mime_type'],
      },
    },
    handler: async (params, credentials) => {
      const { file_id, mime_type } = params as {
        file_id: string;
        mime_type: string;
      };

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=${encodeURIComponent(mime_type)}`,
        {
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
          message?: string;
          errorMessages?: string[];
        };
        throw new Error(`Google Drive export error: ${error.message || response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      return {
        fileId: file_id,
        content: base64,
        mimeType: mime_type,
        size: buffer.byteLength,
      };
    },
  },
};

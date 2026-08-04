import type { CredentialMaterial, Result } from '@authlane/shared';
import { createError } from '@authlane/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface ProviderMcpPolicy {
  endpoint: string;
  requiredScope?: string;
  prefixes: readonly string[];
  allowDirectFallback?: boolean;
  mapToolCall?: (localToolName: string, input: Record<string, unknown>) => ProviderToolCall | null;
  mappedToolNames?: readonly string[];
}

interface ProviderToolCall {
  name: string;
  arguments: Record<string, unknown>;
  requiresAtlassianCloudId?: boolean;
}

function mapAirtableToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'airtable_list_bases' && input.offset === undefined) {
    return { name: 'list_bases', arguments: {} };
  }
  if (localToolName === 'airtable_get_base_schema' && typeof input.base_id === 'string') {
    return { name: 'list_tables_for_base', arguments: { baseId: input.base_id } };
  }
  return null;
}

function toCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamelCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      toCamelCase(entry),
    ])
  );
}

function mapGmailToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'gmail_create_draft') {
    const { html, body, ...rest } = input;
    return {
      name: 'create_draft',
      arguments:
        html === true ? { ...rest, htmlBody: body } : { ...rest, ...(body ? { body } : {}) },
    };
  }
  if (localToolName === 'gmail_create_label') {
    const {
      name,
      label_list_visibility: labelListVisibility,
      message_list_visibility: messageListVisibility,
      background_color: backgroundColor,
      text_color: textColor,
    } = input;
    if (
      (labelListVisibility !== undefined && labelListVisibility !== 'labelShow') ||
      (messageListVisibility !== undefined && messageListVisibility !== 'show')
    ) {
      return null;
    }
    return {
      name: 'create_label',
      arguments: {
        displayName: name,
        ...(typeof backgroundColor === 'string' && typeof textColor === 'string'
          ? { color: { backgroundColor, textColor } }
          : {}),
      },
    };
  }
  if (localToolName === 'gmail_get_thread') {
    if (input.format === 'metadata' || input.metadata_headers !== undefined) return null;
    const format = input.format === 'minimal' ? 'MINIMAL' : 'FULL_CONTENT';
    return {
      name: 'get_thread',
      arguments: { threadId: input.id, messageFormat: format },
    };
  }
  if (localToolName === 'gmail_list_drafts') {
    if (typeof input.max_results === 'number' && input.max_results > 50) return null;
    return {
      name: 'list_drafts',
      arguments: {
        ...(input.max_results !== undefined ? { pageSize: input.max_results } : {}),
        ...(input.page_token !== undefined ? { pageToken: input.page_token } : {}),
      },
    };
  }
  if (localToolName === 'gmail_list_labels') {
    return { name: 'list_labels', arguments: {} };
  }
  if (localToolName === 'gmail_modify_email') {
    const added = Array.isArray(input.add_label_ids) ? input.add_label_ids : [];
    const removed = Array.isArray(input.remove_label_ids) ? input.remove_label_ids : [];
    if (added.length > 0 && removed.length === 0) {
      return { name: 'label_message', arguments: { messageId: input.id, labelIds: added } };
    }
    if (removed.length > 0 && added.length === 0) {
      return { name: 'unlabel_message', arguments: { messageId: input.id, labelIds: removed } };
    }
  }
  return null;
}

function mapGoogleCalendarToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  const providerName = {
    gcal_create_event: 'create_event',
    gcal_list_events: 'list_events',
    gcal_update_event: 'update_event',
    gcal_get_event: 'get_event',
    gcal_delete_event: 'delete_event',
    gcal_list_calendars: 'list_calendars',
  }[localToolName];
  if (!providerName) return null;

  if (localToolName === 'gcal_list_events') {
    if (
      input.single_events === true ||
      input.show_deleted === true ||
      input.updated_min !== undefined ||
      (typeof input.max_results === 'number' && input.max_results > 250)
    ) {
      return null;
    }
    return {
      name: providerName,
      arguments: {
        ...(input.calendar_id !== undefined ? { calendarId: input.calendar_id } : {}),
        ...(input.max_results !== undefined ? { pageSize: input.max_results } : {}),
        ...(input.page_token !== undefined ? { pageToken: input.page_token } : {}),
        ...(input.time_min !== undefined ? { startTime: input.time_min } : {}),
        ...(input.time_max !== undefined ? { endTime: input.time_max } : {}),
        ...(input.timezone !== undefined ? { timeZone: input.timezone } : {}),
        ...(input.order_by !== undefined
          ? { orderBy: input.order_by === 'updated' ? 'lastModified' : input.order_by }
          : {}),
        ...(input.q !== undefined ? { fullText: input.q } : {}),
      },
    };
  }

  if (localToolName === 'gcal_list_calendars') {
    if (
      input.min_access_role !== undefined ||
      input.show_deleted === true ||
      input.show_hidden === true ||
      (typeof input.max_results === 'number' && input.max_results > 250)
    ) {
      return null;
    }
    return {
      name: providerName,
      arguments: {
        ...(input.max_results !== undefined ? { pageSize: input.max_results } : {}),
        ...(input.page_token !== undefined ? { pageToken: input.page_token } : {}),
      },
    };
  }

  if (localToolName === 'gcal_get_event') {
    if (input.timezone !== undefined) return null;
    return {
      name: providerName,
      arguments: {
        eventId: input.event_id,
        ...(input.calendar_id !== undefined ? { calendarId: input.calendar_id } : {}),
      },
    };
  }

  const notificationLevel =
    input.send_updates === undefined
      ? undefined
      : { all: 'ALL', externalOnly: 'EXTERNAL_ONLY', none: 'NONE' }[String(input.send_updates)];
  if (localToolName === 'gcal_delete_event') {
    return {
      name: providerName,
      arguments: {
        eventId: input.event_id,
        ...(input.calendar_id !== undefined ? { calendarId: input.calendar_id } : {}),
        ...(notificationLevel ? { notificationLevel } : {}),
      },
    };
  }

  if (
    input.visibility === 'confidential' ||
    (localToolName === 'gcal_update_event' &&
      (input.attendees !== undefined ||
        input.recurrence !== undefined ||
        input.status !== undefined))
  ) {
    return null;
  }

  const arguments_: Record<string, unknown> = {
    ...(input.calendar_id !== undefined ? { calendarId: input.calendar_id } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.start_time !== undefined ? { startTime: input.start_time } : {}),
    ...(input.end_time !== undefined ? { endTime: input.end_time } : {}),
    ...(input.timezone !== undefined ? { timeZone: input.timezone } : {}),
    ...(input.color_id !== undefined ? { colorId: input.color_id } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(notificationLevel ? { notificationLevel } : {}),
  };
  if (
    (typeof input.start_time === 'string' && !input.start_time.includes('T')) ||
    (typeof input.end_time === 'string' && !input.end_time.includes('T'))
  ) {
    arguments_.allDay = true;
  }
  if (localToolName === 'gcal_update_event') arguments_.eventId = input.event_id;
  if (localToolName === 'gcal_create_event' && Array.isArray(input.attendees)) {
    arguments_.attendees = input.attendees.map((attendee) => {
      if (!attendee || typeof attendee !== 'object') return attendee;
      const { optional, ...rest } = attendee as Record<string, unknown>;
      return { ...rest, ...(optional !== undefined ? { optionalAttendee: optional } : {}) };
    });
  }
  if (localToolName === 'gcal_create_event' && input.recurrence !== undefined) {
    arguments_.recurrenceData = input.recurrence;
  }
  if (input.reminders && typeof input.reminders === 'object') {
    const overrides = Reflect.get(input.reminders, 'overrides');
    if (Array.isArray(overrides)) arguments_.overrideReminders = toCamelCase(overrides);
  }
  return { name: providerName, arguments: arguments_ };
}

function mapGoogleDriveToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'gdrive_get_file') {
    if (input.fields !== undefined || input.supports_all_drives === true) return null;
    return { name: 'get_file_metadata', arguments: { fileId: input.file_id } };
  }
  if (localToolName === 'gdrive_upload_file') {
    if (
      input.description !== undefined ||
      input.starred === true ||
      input.supports_all_drives === true
    ) {
      return null;
    }
    return {
      name: 'create_file',
      arguments: {
        title: input.name,
        contentMimeType: input.mime_type,
        base64Content: input.content,
        ...(input.parent_folder_id ? { parentId: input.parent_folder_id } : {}),
      },
    };
  }
  if (localToolName === 'gdrive_create_folder') {
    if (input.description || input.starred === true || input.supports_all_drives === true) {
      return null;
    }
    return {
      name: 'create_file',
      arguments: {
        title: input.name,
        contentMimeType: 'application/vnd.google-apps.folder',
        ...(input.parent_folder_id ? { parentId: input.parent_folder_id } : {}),
      },
    };
  }
  if (
    localToolName === 'gdrive_download_file' &&
    !input.mime_type &&
    input.supports_all_drives !== true
  ) {
    return { name: 'download_file_content', arguments: { fileId: input.file_id } };
  }
  if (localToolName === 'gdrive_copy_file') {
    if (input.supports_all_drives === true) return null;
    return {
      name: 'copy_file',
      arguments: {
        fileId: input.file_id,
        ...(input.name ? { title: input.name } : {}),
        ...(input.parent_folder_id ? { parentId: input.parent_folder_id } : {}),
      },
    };
  }
  if (localToolName === 'gdrive_search_files') {
    if (input.order_by !== undefined || input.supports_all_drives === true) return null;
    return {
      name: 'search_files',
      arguments: {
        query: input.query,
        ...(input.max_results !== undefined ? { pageSize: input.max_results } : {}),
        ...(input.page_token ? { pageToken: input.page_token } : {}),
      },
    };
  }
  if (localToolName === 'gdrive_list_permissions') {
    if (input.supports_all_drives === true) return null;
    return { name: 'get_file_permissions', arguments: { fileId: input.file_id } };
  }
  return null;
}

function mapSalesforceToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'salesforce_query' && input.includeDeleted !== true) {
    return { name: 'soqlQuery', arguments: { query: input.query } };
  }
  if (
    localToolName === 'salesforce_create_contact' ||
    localToolName === 'salesforce_create_opportunity'
  ) {
    const { customFields, ...standardFields } = input;
    const custom =
      customFields && typeof customFields === 'object' && !Array.isArray(customFields)
        ? customFields
        : {};
    return {
      name: 'createSobjectRecord',
      arguments: {
        'sobject-name': localToolName.endsWith('contact') ? 'Contact' : 'Opportunity',
        body: { ...standardFields, ...custom },
      },
    };
  }
  if (localToolName === 'salesforce_update_opportunity') {
    const { opportunityId, customFields, ...standardFields } = input;
    const custom =
      customFields && typeof customFields === 'object' && !Array.isArray(customFields)
        ? customFields
        : {};
    return {
      name: 'updateSobjectRecord',
      arguments: {
        'sobject-name': 'Opportunity',
        id: opportunityId,
        body: { ...standardFields, ...custom },
      },
    };
  }
  return null;
}

function mapJiraToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'jira_create_issue') {
    const {
      issueType,
      assigneeAccountId,
      labels,
      components,
      dueDate,
      priority,
      ...standardFields
    } = input;
    const additionalFields = {
      ...(labels ? { labels } : {}),
      ...(components ? { components } : {}),
      ...(dueDate ? { duedate: dueDate } : {}),
      ...(priority ? { priority: { name: priority } } : {}),
    };
    return {
      name: 'createJiraIssue',
      arguments: {
        ...standardFields,
        issueTypeName: issueType,
        ...(assigneeAccountId ? { assignee_account_id: assigneeAccountId } : {}),
        ...(Object.keys(additionalFields).length > 0
          ? { additional_fields: additionalFields }
          : {}),
      },
      requiresAtlassianCloudId: true,
    };
  }
  if (localToolName === 'jira_list_issues') {
    if (typeof input.startAt === 'number' && input.startAt > 0) return null;
    const conditions = [];
    if (input.projectKey) conditions.push(`project = ${String(input.projectKey)}`);
    if (input.assigneeAccountId) {
      conditions.push(`assignee = ${String(input.assigneeAccountId)}`);
    }
    if (input.status) conditions.push(`status = "${String(input.status)}"`);
    const jql = typeof input.jql === 'string' ? input.jql : conditions.join(' AND ');
    return {
      name: 'searchJiraIssuesUsingJql',
      arguments: {
        jql,
        ...(input.maxResults !== undefined ? { maxResults: input.maxResults } : {}),
        ...(input.fields !== undefined ? { fields: input.fields } : {}),
      },
      requiresAtlassianCloudId: true,
    };
  }
  return null;
}

function mapGitHubToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'github_create_issue') {
    return { name: 'issue_write', arguments: { ...input, method: 'create' } };
  }
  if (localToolName === 'github_list_issues') {
    const { limit, ...arguments_ } = input;
    return {
      name: 'list_issues',
      arguments: { ...arguments_, ...(limit !== undefined ? { perPage: limit } : {}) },
    };
  }
  if (localToolName === 'github_get_file') {
    return { name: 'get_file_contents', arguments: input };
  }
  if (localToolName === 'github_create_file') {
    if (typeof input.branch !== 'string' || input.branch.length === 0) return null;
    return { name: 'create_or_update_file', arguments: input };
  }
  if (localToolName === 'github_search_code') {
    const { limit, ...arguments_ } = input;
    return {
      name: 'search_code',
      arguments: { ...arguments_, ...(limit !== undefined ? { perPage: limit } : {}) },
    };
  }
  if (localToolName === 'github_list_pull_requests') {
    const { limit, ...arguments_ } = input;
    return {
      name: 'list_pull_requests',
      arguments: { ...arguments_, ...(limit !== undefined ? { perPage: limit } : {}) },
    };
  }
  return null;
}

function mapHubSpotToolCall(
  localToolName: string,
  input: Record<string, unknown>
): { name: string; arguments: Record<string, unknown> } | null {
  if (localToolName === 'hubspot_list_contacts' || localToolName === 'hubspot_list_deals') {
    return {
      name: 'search_crm_objects',
      arguments: {
        ...input,
        objectType: localToolName.endsWith('contacts') ? 'contacts' : 'deals',
      },
    };
  }
  if (localToolName === 'hubspot_get_contact' || localToolName === 'hubspot_get_deal') {
    const isContact = localToolName.endsWith('contact');
    const idKey = isContact ? 'contactId' : 'dealId';
    const objectId = input[idKey];
    if (typeof objectId !== 'string' || objectId.length === 0) return null;
    return {
      name: 'get_crm_objects',
      arguments: {
        objectType: isContact ? 'contacts' : 'deals',
        objectIds: [objectId],
        ...(Array.isArray(input.properties) ? { properties: input.properties } : {}),
      },
    };
  }
  return null;
}

function mapPipedriveToolCall(
  localToolName: string,
  input: Record<string, unknown>
): ProviderToolCall | null {
  if (localToolName === 'pipedrive_get_deal') {
    return { name: 'getDeal', arguments: { id: input.deal_id } };
  }
  if (localToolName === 'pipedrive_get_contact') {
    return { name: 'getPerson', arguments: { id: input.person_id } };
  }

  if (localToolName === 'pipedrive_list_deals' || localToolName === 'pipedrive_list_contacts') {
    const allowedKeys = new Set(['start']);
    if (
      Object.keys(input).some((key) => !allowedKeys.has(key)) ||
      (input.start !== undefined && input.start !== 0)
    ) {
      return null;
    }
    return {
      name: localToolName.endsWith('deals') ? 'getDeals' : 'getPersons',
      arguments: {},
    };
  }

  if (localToolName === 'pipedrive_create_deal' || localToolName === 'pipedrive_add_contact') {
    return {
      name: localToolName.endsWith('deal') ? 'addDeal' : 'addPerson',
      arguments: toCamelCase(input) as Record<string, unknown>,
    };
  }

  if (localToolName === 'pipedrive_update_deal') {
    const { deal_id: id, ...changes } = input;
    return {
      name: 'updateDeal',
      arguments: { id, ...(toCamelCase(changes) as Record<string, unknown>) },
    };
  }
  if (localToolName === 'pipedrive_update_contact') {
    const { person_id: id, ...changes } = input;
    return {
      name: 'updatePerson',
      arguments: { id, ...(toCamelCase(changes) as Record<string, unknown>) },
    };
  }

  const providerName = {
    pipedrive_get_activities: 'getActivities',
    pipedrive_get_activity: 'getActivity',
    pipedrive_add_activity: 'addActivity',
    pipedrive_update_activity: 'updateActivity',
    pipedrive_search_deals: 'searchDeals',
    pipedrive_search_persons: 'searchPersons',
    pipedrive_get_organizations: 'getOrganizations',
    pipedrive_get_organization: 'getOrganization',
    pipedrive_add_organization: 'addOrganization',
    pipedrive_update_organization: 'updateOrganization',
    pipedrive_search_organization: 'searchOrganization',
    pipedrive_search_leads: 'searchLeads',
    pipedrive_convert_lead_to_deal: 'convertLeadToDeal',
    pipedrive_get_lead_conversion_status: 'getLeadConversionStatus',
    pipedrive_get_stages: 'getStages',
    pipedrive_get_stage: 'getStage',
    pipedrive_get_notes: 'getNotes',
    pipedrive_get_note: 'getNote',
    pipedrive_add_note: 'addNote',
    pipedrive_update_note: 'updateNote',
  }[localToolName];
  if (providerName) {
    return {
      name: providerName,
      arguments: toCamelCase(input) as Record<string, unknown>,
    };
  }
  return null;
}

const PROVIDER_MCP_POLICIES: Readonly<Record<string, ProviderMcpPolicy>> = Object.freeze({
  airtable: {
    endpoint: 'https://mcp.airtable.com/mcp',
    prefixes: ['airtable_'],
    mapToolCall: mapAirtableToolCall,
    mappedToolNames: [
      'airtable_list_bases',
      'airtable_get_base_schema',
      'airtable_get_table_schema',
    ],
  },
  attio: {
    endpoint: 'https://mcp.attio.com/mcp',
    prefixes: ['attio_'],
    allowDirectFallback: false,
  },
  github: {
    endpoint: 'https://api.githubcopilot.com/mcp/',
    // No direct fallback: the handlers were removed, so falling through would only produce a
    // confusing PROVIDER_REQUEST_FAILED instead of naming the real problem.
    allowDirectFallback: false,
    prefixes: ['github_'],
    mapToolCall: mapGitHubToolCall,
    mappedToolNames: [
      'github_create_issue',
      'github_list_issues',
      'github_get_file',
      'github_create_file',
      'github_search_code',
      'github_list_pull_requests',
    ],
  },
  gmail: {
    endpoint: 'https://gmailmcp.googleapis.com/mcp/v1',
    prefixes: ['gmail_'],
    mapToolCall: mapGmailToolCall,
    mappedToolNames: [
      'gmail_create_draft',
      'gmail_create_label',
      'gmail_get_thread',
      'gmail_list_drafts',
      'gmail_list_labels',
      'gmail_modify_email',
    ],
  },
  hubspot: {
    endpoint: 'https://mcp.hubspot.com',
    prefixes: ['hubspot_'],
    allowDirectFallback: false,
    mapToolCall: mapHubSpotToolCall,
    mappedToolNames: [
      'hubspot_list_contacts',
      'hubspot_list_deals',
      'hubspot_get_contact',
      'hubspot_get_deal',
    ],
  },
  'google-calendar': {
    endpoint: 'https://calendarmcp.googleapis.com/mcp/v1',
    prefixes: ['gcal_', 'google_calendar_'],
    mapToolCall: mapGoogleCalendarToolCall,
    mappedToolNames: [
      'gcal_create_event',
      'gcal_list_events',
      'gcal_update_event',
      'gcal_get_event',
      'gcal_delete_event',
      'gcal_list_calendars',
    ],
  },
  'google-drive': {
    endpoint: 'https://drivemcp.googleapis.com/mcp/v1',
    prefixes: ['gdrive_', 'google_drive_'],
    mapToolCall: mapGoogleDriveToolCall,
    mappedToolNames: [
      'gdrive_get_file',
      'gdrive_upload_file',
      'gdrive_create_folder',
      'gdrive_download_file',
      'gdrive_copy_file',
      'gdrive_search_files',
      'gdrive_list_permissions',
    ],
  },
  jira: {
    endpoint: 'https://mcp.atlassian.com/v1/mcp/authv2',
    prefixes: ['jira_'],
    mapToolCall: mapJiraToolCall,
    mappedToolNames: ['jira_create_issue', 'jira_list_issues'],
  },
  linear: {
    endpoint: 'https://mcp.linear.app/mcp',
    prefixes: ['linear_'],
  },
  pipedrive: {
    endpoint: 'https://mcp.pipedrive.ai/mcp',
    prefixes: ['pipedrive_'],
    mapToolCall: mapPipedriveToolCall,
    mappedToolNames: [
      'pipedrive_create_deal',
      'pipedrive_list_deals',
      'pipedrive_get_deal',
      'pipedrive_update_deal',
      'pipedrive_add_contact',
      'pipedrive_list_contacts',
      'pipedrive_get_contact',
      'pipedrive_update_contact',
      'pipedrive_search',
      'pipedrive_get_activities',
      'pipedrive_get_activity',
      'pipedrive_add_activity',
      'pipedrive_update_activity',
      'pipedrive_search_deals',
      'pipedrive_search_persons',
      'pipedrive_get_organizations',
      'pipedrive_get_organization',
      'pipedrive_add_organization',
      'pipedrive_update_organization',
      'pipedrive_search_organization',
      'pipedrive_search_leads',
      'pipedrive_convert_lead_to_deal',
      'pipedrive_get_lead_conversion_status',
      'pipedrive_get_stages',
      'pipedrive_get_stage',
      'pipedrive_get_notes',
      'pipedrive_get_note',
      'pipedrive_add_note',
      'pipedrive_update_note',
    ],
  },
  salesforce: {
    endpoint: 'https://api.salesforce.com/platform/mcp/v1/platform/sobject-all',
    requiredScope: 'mcp_api',
    prefixes: ['salesforce_'],
    mapToolCall: mapSalesforceToolCall,
    mappedToolNames: [
      'salesforce_query',
      'salesforce_create_contact',
      'salesforce_create_opportunity',
      'salesforce_update_opportunity',
    ],
  },
  slack: {
    endpoint: 'https://mcp.slack.com/mcp',
    prefixes: ['slack_'],
  },
});

/** A tool exactly as the provider's server describes it, before Authlane decides anything. */
export interface ProviderMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** What the server claims about itself. Never the basis for a risk decision. */
  declaredAnnotations: Record<string, unknown> | null;
}

export interface ProviderMcpClient {
  listTools(): Promise<readonly string[]>;
  /**
   * The server's full catalogue.
   *
   * Separate from listTools because the execution path only needs to know whether a name exists,
   * and paying for schemas on every tool call would be waste.
   */
  listToolDefinitions(): Promise<readonly ProviderMcpToolDefinition[]>;
  callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export type ProviderMcpClientFactory = (options: {
  endpoint: string;
  accessToken: string;
  tokenType: string;
}) => Promise<ProviderMcpClient>;

export const createProviderMcpClient: ProviderMcpClientFactory = async ({
  endpoint,
  accessToken,
}) => {
  const client = new Client({ name: '@authlane/ai', version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  return {
    async listTools() {
      const result = await client.listTools();
      return result.tools.map((tool) => tool.name);
    },
    async listToolDefinitions() {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: (tool.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
        declaredAnnotations: (tool.annotations ?? null) as Record<string, unknown> | null,
      }));
    },
    callTool(name, arguments_) {
      return client.callTool({ name, arguments: arguments_ });
    },
    async close() {
      await client.close();
    },
  };
};

function normalizedToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveProviderToolName(
  localToolName: string,
  providerToolNames: readonly string[],
  prefixes: readonly string[]
): string | null {
  const candidates = new Set([localToolName]);
  for (const prefix of prefixes) {
    if (localToolName.startsWith(prefix)) candidates.add(localToolName.slice(prefix.length));
  }
  const normalizedCandidates = new Set([...candidates].map(normalizedToolName));
  const matches = providerToolNames.filter((name) =>
    normalizedCandidates.has(normalizedToolName(name))
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function extractAtlassianCloudId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    try {
      return extractAtlassianCloudId(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = extractAtlassianCloudId(entry);
      if (id) return id;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.cloudId === 'string' && record.cloudId.length > 0) return record.cloudId;
  if (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.url === 'string' &&
    new URL(record.url).hostname.endsWith('.atlassian.net')
  ) {
    return record.id;
  }
  for (const entry of Object.values(record)) {
    const id = extractAtlassianCloudId(entry);
    if (id) return id;
  }
  return undefined;
}

export function getProviderMcpPolicy(serviceId: string):
  | {
      endpoint: string;
      requiredScope?: string;
      allowDirectFallback: boolean;
      /** Contract naming for this service, so a discovered tool is not offered twice. */
      prefixes: readonly string[];
    }
  | undefined {
  const policy = PROVIDER_MCP_POLICIES[serviceId];
  if (!policy) return undefined;
  return {
    endpoint: policy.endpoint,
    ...(policy.requiredScope ? { requiredScope: policy.requiredScope } : {}),
    allowDirectFallback: policy.allowDirectFallback !== false,
    prefixes: policy.prefixes,
  };
}

/** Every service Authlane can ask for a tool catalogue. Ordered, so callers are deterministic. */
export function providerMcpServiceIds(): readonly string[] {
  return Object.keys(PROVIDER_MCP_POLICIES).sort();
}

type ProviderMcpExecution =
  | { status: 'fallback' }
  | { status: 'completed'; result: Result<unknown> };

export async function executePreferredProviderMcp(
  serviceId: string,
  toolName: string,
  input: Record<string, unknown>,
  credential: CredentialMaterial,
  clientFactory: ProviderMcpClientFactory
): Promise<ProviderMcpExecution> {
  const policy = PROVIDER_MCP_POLICIES[serviceId];
  if (
    !policy ||
    credential.type !== 'oauth2' ||
    (policy.requiredScope && !credential.scopes.includes(policy.requiredScope))
  ) {
    return { status: 'fallback' };
  }

  let client: ProviderMcpClient | undefined;
  let callStarted = false;
  try {
    client = await clientFactory({
      endpoint: policy.endpoint,
      accessToken: credential.accessToken,
      tokenType: credential.tokenType,
    });
    const providerToolNames = await client.listTools();
    const mappedCall = policy.mapToolCall?.(toolName, input);
    if (policy.mapToolCall && !mappedCall && policy.mappedToolNames?.includes(toolName)) {
      if (policy.allowDirectFallback !== false) return { status: 'fallback' };
      return {
        status: 'completed',
        result: {
          data: null,
          error: createError('Provider MCP tool is unavailable', 'PROVIDER_MCP_TOOL_UNAVAILABLE'),
        },
      };
    }
    const providerToolName =
      mappedCall?.name ?? resolveProviderToolName(toolName, providerToolNames, policy.prefixes);
    if (!providerToolName || !providerToolNames.includes(providerToolName)) {
      if (policy.allowDirectFallback !== false) return { status: 'fallback' };
      return {
        status: 'completed',
        result: {
          data: null,
          error: createError('Provider MCP tool is unavailable', 'PROVIDER_MCP_TOOL_UNAVAILABLE'),
        },
      };
    }

    let providerArguments = mappedCall?.arguments ?? input;
    if (mappedCall?.requiresAtlassianCloudId) {
      if (!providerToolNames.includes('getAccessibleAtlassianResources')) {
        return { status: 'fallback' };
      }
      const resources = await client.callTool('getAccessibleAtlassianResources', {});
      const cloudId = extractAtlassianCloudId(resources);
      if (!cloudId) return { status: 'fallback' };
      providerArguments = { cloudId, ...providerArguments };
    }

    callStarted = true;
    const data = await client.callTool(providerToolName, providerArguments);
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Reflect.get(data, 'isError') === true
    ) {
      return {
        status: 'completed',
        result: {
          data: null,
          error: createError('Provider request failed', 'PROVIDER_REQUEST_FAILED'),
        },
      };
    }
    return { status: 'completed', result: { data, error: null } };
  } catch {
    if (!callStarted && policy.allowDirectFallback !== false) return { status: 'fallback' };
    return {
      status: 'completed',
      result: {
        data: null,
        error: createError('Provider request failed', 'PROVIDER_REQUEST_FAILED'),
      },
    };
  } finally {
    try {
      await client?.close();
    } catch {
      // Closing a provider session must not change an already determined tool result.
    }
  }
}

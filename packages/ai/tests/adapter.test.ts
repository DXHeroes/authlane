import {
  type CredentialMaterial,
  type IntegrationAdapter,
  SUPPORTED_SERVICE_IDS,
} from '@authlane/shared';
import { describe, expect, it, vi } from 'vitest';
import { createBuiltInAdapter } from '../src/index.js';

const oauthLease = {
  type: 'oauth2' as const,
  leaseId: 'lease_123',
  accessToken: 'oauth-secret',
  tokenType: 'Bearer',
  scopes: ['repo:read'],
  expiresAt: '2026-07-18T12:00:00.000Z',
};

const apiKeyLease = {
  type: 'api_key' as const,
  leaseId: 'lease_456',
  value: 'api-secret',
  placement: { type: 'header' as const, name: 'X-API-Key', prefix: 'Bearer' },
  expiresAt: '2026-07-18T12:00:00.000Z',
};

const input = {
  externalUserId: 'user_123',
  serviceId: 'github',
  toolName: 'github_list_repos',
  arguments: { visibility: 'private' },
  credential: oauthLease,
};

function customIntegration(
  serviceId: string,
  execute: IntegrationAdapter['execute']
): IntegrationAdapter {
  return { serviceId, definitions: [], execute };
}

describe('createBuiltInAdapter', () => {
  it('prefers an explicit custom integration and executes locally', async () => {
    const execute = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const custom = customIntegration('github', execute);
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      'github_list_repos',
      { visibility: 'private' },
      {
        type: 'oauth2',
        accessToken: 'oauth-secret',
        tokenType: 'Bearer',
        scopes: ['repo:read'],
        expiresAt: '2026-07-18T12:00:00.000Z',
      }
    );
    expect(result).toEqual({ data: { ok: true }, error: null });
  });

  it('prefers an official provider MCP tool before the built-in direct adapter', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'created' }] }));
    const close = vi.fn(async () => undefined);
    const providerMcpClientFactory = vi.fn(async () => ({
      listTools: async () => ['issue_write'],
      callTool,
      close,
    }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('github', directExecute)],
      providerMcpClientFactory,
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({ ...input, toolName: 'github_create_issue' });

    expect(result).toEqual({
      data: { content: [{ type: 'text', text: 'created' }] },
      error: null,
    });
    expect(providerMcpClientFactory).toHaveBeenCalledWith({
      endpoint: 'https://api.githubcopilot.com/mcp/',
      accessToken: 'oauth-secret',
      tokenType: 'Bearer',
    });
    expect(callTool).toHaveBeenCalledWith('issue_write', {
      method: 'create',
      visibility: 'private',
    });
    expect(directExecute).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('falls back to the direct adapter only before an MCP tool call starts', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('github', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['different_tool'],
        callTool: vi.fn(),
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    expect(await adapter.execute(input)).toEqual({ data: { path: 'direct' }, error: null });
    expect(directExecute).toHaveBeenCalledOnce();
  });

  it('never retries a possibly-started MCP mutation through the direct API', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('github', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['issue_write'],
        callTool: async () => {
          throw new Error('ambiguous provider failure');
        },
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({ ...input, toolName: 'github_create_issue' });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_REQUEST_FAILED', message: 'Provider request failed' },
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('maps GitHub pagination and avoids an invalid MCP file mutation without a branch', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [] }));
    const providerMcpClientFactory = async () => ({
      listTools: async () => ['list_issues', 'create_or_update_file'],
      callTool,
      close: async () => undefined,
    });
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('github', directExecute)],
      providerMcpClientFactory,
      providerMcpForCustomIntegrations: true,
    });

    await adapter.execute({
      ...input,
      toolName: 'github_list_issues',
      arguments: { owner: 'dxheroes', repo: 'authlane', state: 'open', limit: 25 },
    });
    expect(callTool).toHaveBeenCalledWith('list_issues', {
      owner: 'dxheroes',
      repo: 'authlane',
      state: 'open',
      perPage: 25,
    });

    const result = await adapter.execute({
      ...input,
      toolName: 'github_create_file',
      arguments: {
        owner: 'dxheroes',
        repo: 'authlane',
        path: 'README.md',
        message: 'Update README',
        content: 'content',
      },
    });
    expect(result).toEqual({ data: { path: 'direct' }, error: null });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('maps HubSpot read tools to the official provider MCP and never uses a CRM fallback token', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'contacts' }] }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('hubspot', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['search_crm_objects', 'get_crm_objects'],
        callTool,
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'hubspot',
      toolName: 'hubspot_list_contacts',
      arguments: { limit: 20 },
      credential: { ...oauthLease, scopes: [] },
    });

    expect(result.error).toBeNull();
    expect(callTool).toHaveBeenCalledWith('search_crm_objects', {
      objectType: 'contacts',
      limit: 20,
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('translates Google Workspace arguments to the official MCP schema', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'draft' }] }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('gmail', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['create_draft'],
        callTool,
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'gmail',
      toolName: 'gmail_create_draft',
      arguments: {
        to: ['user@example.com'],
        subject: 'Hello',
        body: '<strong>Hello</strong>',
        html: true,
      },
      credential: { ...oauthLease, scopes: ['https://www.googleapis.com/auth/gmail.compose'] },
    });

    expect(result.error).toBeNull();
    expect(callTool).toHaveBeenCalledWith('create_draft', {
      to: ['user@example.com'],
      subject: 'Hello',
      htmlBody: '<strong>Hello</strong>',
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('uses exact Google MCP schemas and falls back before unsupported semantics', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [] }));
    const providerMcpClientFactory = async () => ({
      listTools: async () => ['create_label', 'list_events', 'create_file'],
      callTool,
      close: async () => undefined,
    });
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [
        customIntegration('gmail', directExecute),
        customIntegration('google-calendar', directExecute),
        customIntegration('google-drive', directExecute),
      ],
      providerMcpClientFactory,
      providerMcpForCustomIntegrations: true,
    });

    await adapter.execute({
      ...input,
      serviceId: 'gmail',
      toolName: 'gmail_create_label',
      arguments: {
        name: 'Customers',
        background_color: '#000000',
        text_color: '#ffffff',
      },
    });
    expect(callTool).toHaveBeenNthCalledWith(1, 'create_label', {
      displayName: 'Customers',
      color: { backgroundColor: '#000000', textColor: '#ffffff' },
    });

    await adapter.execute({
      ...input,
      serviceId: 'google-calendar',
      toolName: 'gcal_list_events',
      arguments: {
        calendar_id: 'primary',
        max_results: 25,
        order_by: 'updated',
      },
    });
    expect(callTool).toHaveBeenNthCalledWith(2, 'list_events', {
      calendarId: 'primary',
      pageSize: 25,
      orderBy: 'lastModified',
    });

    await adapter.execute({
      ...input,
      serviceId: 'google-drive',
      toolName: 'gdrive_create_folder',
      arguments: { name: 'Reports' },
    });
    expect(callTool).toHaveBeenNthCalledWith(3, 'create_file', {
      title: 'Reports',
      contentMimeType: 'application/vnd.google-apps.folder',
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'google-calendar',
      toolName: 'gcal_update_event',
      arguments: { event_id: 'event_1', attendees: [{ email: 'user@example.com' }] },
    });
    expect(result).toEqual({ data: { path: 'direct' }, error: null });
    expect(callTool).toHaveBeenCalledTimes(3);
  });

  it('uses the official Airtable MCP server only for schema-compatible operations', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [] }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('airtable', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['list_bases', 'list_tables_for_base', 'get_table_schema'],
        callTool,
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    await adapter.execute({
      ...input,
      serviceId: 'airtable',
      toolName: 'airtable_list_bases',
      arguments: {},
    });
    await adapter.execute({
      ...input,
      serviceId: 'airtable',
      toolName: 'airtable_get_base_schema',
      arguments: { base_id: 'app123' },
    });
    const fallback = await adapter.execute({
      ...input,
      serviceId: 'airtable',
      toolName: 'airtable_get_table_schema',
      arguments: { base_id: 'app123', table_id: 'tbl123' },
    });

    expect(callTool).toHaveBeenNthCalledWith(1, 'list_bases', {});
    expect(callTool).toHaveBeenNthCalledWith(2, 'list_tables_for_base', { baseId: 'app123' });
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(fallback).toEqual({ data: { path: 'direct' }, error: null });
  });

  it('prefers the official Pipedrive MCP server for compatible CRM operations', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'deal' }] }));
    const providerMcpClientFactory = vi.fn(async () => ({
      listTools: async () => ['getDeal', 'getDeals'],
      callTool,
      close: async () => undefined,
    }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('pipedrive', directExecute)],
      providerMcpClientFactory,
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'pipedrive',
      toolName: 'pipedrive_get_deal',
      arguments: { deal_id: 42 },
    });
    const fallback = await adapter.execute({
      ...input,
      serviceId: 'pipedrive',
      toolName: 'pipedrive_list_deals',
      arguments: { stage_id: 7 },
    });

    expect(providerMcpClientFactory).toHaveBeenCalledWith({
      endpoint: 'https://mcp.pipedrive.ai/mcp',
      accessToken: 'oauth-secret',
      tokenType: 'Bearer',
    });
    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith('getDeal', { id: 42 });
    expect(result.error).toBeNull();
    expect(fallback).toEqual({ data: { path: 'direct' }, error: null });
    expect(directExecute).toHaveBeenCalledOnce();
  });

  it('normalizes canonical Attio names to the official hyphenated MCP tools', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'records' }] }));
    const providerMcpClientFactory = vi.fn(async () => ({
      listTools: async () => ['search-records'],
      callTool,
      close: async () => undefined,
    }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('attio', directExecute)],
      providerMcpClientFactory,
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'attio',
      toolName: 'attio_search_records',
      arguments: { query: 'Linear' },
    });

    expect(result.error).toBeNull();
    expect(providerMcpClientFactory).toHaveBeenCalledWith({
      endpoint: 'https://mcp.attio.com/mcp',
      accessToken: 'oauth-secret',
      tokenType: 'Bearer',
    });
    expect(callTool).toHaveBeenCalledWith('search-records', { query: 'Linear' });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('confines Microsoft Work IQ calls to the selected workload', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'mail' }] }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('microsoft-mail', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['fetch'],
        callTool,
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });
    const credential = {
      ...oauthLease,
      scopes: ['api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask'],
    };

    const allowed = await adapter.execute({
      ...input,
      serviceId: 'microsoft-mail',
      toolName: 'microsoft_mail_fetch',
      arguments: { entityUrls: ['/me/messages'] },
      credential,
    });
    const blocked = await adapter.execute({
      ...input,
      serviceId: 'microsoft-mail',
      toolName: 'microsoft_mail_fetch',
      arguments: { entityUrls: ['/sites/root'] },
      credential,
    });

    expect(allowed.error).toBeNull();
    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith('fetch', { entityUrls: ['/me/messages'] });
    expect(blocked).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_MCP_TOOL_UNAVAILABLE' },
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('never sends a Microsoft Work IQ token directly to Microsoft Graph', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const adapter = createBuiltInAdapter(({ tools }) => tools, { providerMcp: 'disabled' });

      const result = await adapter.execute({
        ...input,
        serviceId: 'microsoft-mail',
        toolName: 'microsoft_mail_fetch',
        arguments: { entityUrls: ['/me/messages'] },
        credential: {
          ...oauthLease,
          scopes: ['api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask'],
        },
      });

      expect(result).toMatchObject({
        data: null,
        error: { code: 'PROVIDER_REQUEST_FAILED', message: 'Provider request failed' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('maps Salesforce wrappers to the official SObject MCP tools', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'created' }] }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('salesforce', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['createSobjectRecord'],
        callTool,
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'salesforce',
      toolName: 'salesforce_create_contact',
      arguments: { LastName: 'Lovelace', customFields: { Customer_Tier__c: 'Gold' } },
      credential: { ...oauthLease, scopes: ['mcp_api'] },
    });

    expect(result.error).toBeNull();
    expect(callTool).toHaveBeenCalledWith('createSobjectRecord', {
      'sobject-name': 'Contact',
      body: { LastName: 'Lovelace', Customer_Tier__c: 'Gold' },
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('discovers the Jira cloud before invoking the official Rovo MCP mutation', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const callTool = vi.fn(async (name: string) =>
      name === 'getAccessibleAtlassianResources'
        ? {
            content: [
              { type: 'text', text: '[{"id":"cloud-123","url":"https://acme.atlassian.net"}]' },
            ],
          }
        : { content: [{ type: 'text', text: 'created' }] }
    );
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('jira', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['getAccessibleAtlassianResources', 'createJiraIssue'],
        callTool,
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'jira',
      toolName: 'jira_create_issue',
      arguments: {
        projectKey: 'AUTH',
        issueType: 'Task',
        summary: 'MCP-first',
        assigneeAccountId: 'account-123',
        labels: ['integration'],
      },
      credential: { ...oauthLease, scopes: ['write:jira-work'] },
    });

    expect(result.error).toBeNull();
    expect(callTool).toHaveBeenNthCalledWith(1, 'getAccessibleAtlassianResources', {});
    expect(callTool).toHaveBeenNthCalledWith(2, 'createJiraIssue', {
      cloudId: 'cloud-123',
      projectKey: 'AUTH',
      issueTypeName: 'Task',
      summary: 'MCP-first',
      assignee_account_id: 'account-123',
      additional_fields: { labels: ['integration'] },
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('does not send a HubSpot MCP credential to the direct CRM adapter', async () => {
    const directExecute = vi.fn(async () => ({ data: { path: 'direct' }, error: null }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('hubspot', directExecute)],
      providerMcpClientFactory: async () => ({
        listTools: async () => ['search_crm_objects'],
        callTool: vi.fn(),
        close: async () => undefined,
      }),
      providerMcpForCustomIntegrations: true,
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'hubspot',
      toolName: 'hubspot_get_contact',
      arguments: { contactId: 'contact_1' },
      credential: { ...oauthLease, scopes: [] },
    });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_MCP_TOOL_UNAVAILABLE' },
    });
    expect(directExecute).not.toHaveBeenCalled();
  });

  it('forwards only validated provider routing context to a local integration', async () => {
    let receivedCredential: CredentialMaterial | undefined;
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [
        customIntegration('pipedrive', async (_toolName, _arguments, credential) => {
          receivedCredential = credential;
          return { data: { ok: true }, error: null };
        }),
      ],
    });

    const result = await adapter.execute({
      ...input,
      serviceId: 'pipedrive',
      credential: {
        ...oauthLease,
        providerContext: { apiBaseUrl: 'https://acme.pipedrive.com' },
      },
    });

    expect(result).toEqual({ data: { ok: true }, error: null });
    expect(receivedCredential).toMatchObject({
      providerContext: { apiBaseUrl: 'https://acme.pipedrive.com' },
    });
  });

  it('snapshots custom integrations and deterministically lets the last duplicate win', async () => {
    const first = vi.fn(async () => ({ data: 'first', error: null }));
    const last = vi.fn(async () => ({ data: 'last', error: null }));
    const replacement = vi.fn(async () => ({ data: 'replacement', error: null }));
    const mutable = customIntegration('github', last);
    const integrations = [customIntegration('github', first), mutable];
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations });

    mutable.serviceId = 'slack';
    mutable.execute = replacement;
    integrations.splice(0, integrations.length);

    const result = await adapter.execute(input);

    expect(result).toEqual({ data: 'last', error: null });
    expect(last).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });

  it('preserves a class integration receiver with private and prototype state', async () => {
    class StatefulIntegration implements IntegrationAdapter {
      readonly serviceId = 'github';
      readonly definitions = [];
      readonly #marker = 'private-state';

      private resultFromPrototype(): string {
        return this.#marker;
      }

      async execute(
        _toolName: string,
        _arguments: Record<string, unknown>,
        _credential: CredentialMaterial
      ) {
        return { data: this.resultFromPrototype(), error: null };
      }
    }

    const custom = new StatefulIntegration();
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);

    expect(result).toEqual({ data: 'private-state', error: null });
  });

  it('preserves callable integration identity as the execute receiver', async () => {
    type CallableIntegration = IntegrationAdapter & (() => void) & { marker: string };
    const custom = function callableIntegration() {} as CallableIntegration;
    custom.serviceId = 'github';
    custom.definitions = [];
    custom.marker = 'function-object';
    custom.execute = async function execute(this: CallableIntegration) {
      return {
        data: { marker: this.marker, sameReceiver: this === custom },
        error: null,
      };
    };
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);

    expect(result).toEqual({
      data: { marker: 'function-object', sameReceiver: true },
      error: null,
    });
  });

  it('converts API-key leases without forwarding lease metadata', async () => {
    let receivedCredential: CredentialMaterial | undefined;
    const custom = customIntegration('stripe', async (_toolName, _arguments, credential) => {
      receivedCredential = credential;
      return { data: { ok: true }, error: null };
    });
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute({
      ...input,
      serviceId: 'stripe',
      toolName: 'stripe_list_customers',
      credential: apiKeyLease,
    });

    expect(result).toEqual({ data: { ok: true }, error: null });
    expect(receivedCredential).toEqual({ type: 'api_key', apiKey: 'api-secret' });
    expect(receivedCredential).not.toHaveProperty('leaseId');
    expect(receivedCredential).not.toHaveProperty('placement');
    expect(receivedCredential).not.toHaveProperty('expiresAt');
  });

  it('redacts thrown provider errors and credential material', async () => {
    const custom = customIntegration('github', async () => {
      throw new Error(`request rejected for ${oauthLease.accessToken}`);
    });
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_REQUEST_FAILED', message: 'Provider request failed' },
    });
    expect(serialized).not.toContain(oauthLease.accessToken);
    expect(serialized).not.toContain('request rejected');
  });

  it('redacts errors returned by integrations', async () => {
    const custom = customIntegration('github', async () => ({
      data: null,
      error: {
        code: 'UPSTREAM_ERROR',
        message: `provider returned ${oauthLease.accessToken}`,
        hint: `retry with ${oauthLease.accessToken}`,
      },
    }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_REQUEST_FAILED', message: 'Provider request failed' },
    });
    expect(serialized).not.toContain(oauthLease.accessToken);
    expect(serialized).not.toContain('UPSTREAM_ERROR');
  });

  it('returns a fixed safe error for malformed credentials', async () => {
    const execute = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('github', execute)],
    });
    const malformed = {
      ...oauthLease,
      accessToken: '',
      scopes: ['repo:read', 42],
    };

    const result = await adapter.execute({
      ...input,
      credential: malformed as never,
    });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'INVALID_CREDENTIAL_MATERIAL', message: 'Credential material is invalid' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('repo:read');
  });

  it('returns INTEGRATION_NOT_FOUND for unknown services', async () => {
    const adapter = createBuiltInAdapter(({ tools }) => tools, { providerMcp: 'disabled' });

    const result = await adapter.execute({ ...input, serviceId: 'unknown-service' });

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'INTEGRATION_NOT_FOUND',
        message: 'No local adapter for requested service',
      },
    });
  });

  it('lazily resolves every supported built-in integration', async () => {
    const adapter = createBuiltInAdapter(({ tools }) => tools);

    for (const serviceId of SUPPORTED_SERVICE_IDS) {
      const result = await adapter.execute({
        ...input,
        serviceId,
        toolName: '__authlane_missing_tool__',
      });
      expect(result.error?.code, serviceId).toBe('PROVIDER_REQUEST_FAILED');
      expect(JSON.stringify(result), serviceId).not.toContain(oauthLease.accessToken);
    }
  });
});

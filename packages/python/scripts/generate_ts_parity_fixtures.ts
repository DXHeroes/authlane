import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { tools as airtable } from '../../../integrations/airtable/tools.ts';
import { tools as discord } from '../../../integrations/discord/tools.ts';
import { tools as gmail } from '../../../integrations/gmail/tools.ts';
import { tools as googleCalendar } from '../../../integrations/google-calendar/tools.ts';
import { tools as googleDrive } from '../../../integrations/google-drive/tools.ts';
import { tools as hubspot } from '../../../integrations/hubspot/tools.ts';
import { tools as jira } from '../../../integrations/jira/tools.ts';
import { tools as linear } from '../../../integrations/linear/tools.ts';
import { tools as notion } from '../../../integrations/notion/tools.ts';
import { tools as pipedrive } from '../../../integrations/pipedrive/tools.ts';
import { tools as salesforce } from '../../../integrations/salesforce/tools.ts';
import { tools as slack } from '../../../integrations/slack/tools.ts';
import { tools as stripe } from '../../../integrations/stripe/tools.ts';

type Schema = {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  default?: unknown;
  additionalProperties?: boolean | Schema;
  minimum?: number;
  minLength?: number;
  minItems?: number;
};

type CapturedResponse = {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
};

const integrations = {
  airtable,
  discord,
  gmail,
  'google-calendar': googleCalendar,
  'google-drive': googleDrive,
  hubspot,
  jira,
  linear,
  notion,
  pipedrive,
  salesforce,
  slack,
  stripe,
} as const;

const specialStrings: Record<string, string> = {
  access_token: 'provider-secret',
  assigneeAccountId: 'account-1',
  body: 'Body text',
  color_id: '5',
  content: Buffer.from('hello').toString('base64'),
  dueDate: '2026-07-31',
  email: 'dev@example.com',
  email_address: 'dev@example.com',
  end_time: '2026-07-20T11:00:00Z',
  fields: 'id,name',
  format: 'metadata',
  mime_type: 'text/plain',
  page_token: 'page-2',
  query: 'status:open',
  reply_to: 'reply@example.com',
  start_time: '2026-07-20T10:00:00Z',
  time_max: '2026-07-21T00:00:00Z',
  time_min: '2026-07-20T00:00:00Z',
  timezone: 'Europe/Prague',
  transitionId: 'transition-1',
  transitionName: 'Done',
  updated_min: '2026-07-01T00:00:00Z',
};

function valueFor(name: string, schema: Schema, includeOptional = true): unknown {
  if (schema.enum?.length) return schema.enum.at(-1);
  if (schema.type === 'object') {
    const properties = schema.properties ?? {};
    const names = includeOptional ? Object.keys(properties) : (schema.required ?? []);
    const value = Object.fromEntries(
      names.map((property) => [property, valueFor(property, properties[property] ?? {}, true)])
    );
    if (!Object.keys(value).length && schema.additionalProperties) return { custom: 'value' };
    return value;
  }
  if (schema.type === 'array') return [valueFor(name, schema.items ?? {}, true)];
  if (schema.type === 'boolean') return true;
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  return specialStrings[name] ?? `${name || 'value'}-value`;
}

function requiredInput(schema: Schema): Record<string, unknown> {
  const properties = schema.properties ?? {};
  return Object.fromEntries(
    (schema.required ?? []).map((name) => [name, valueFor(name, properties[name] ?? {}, true)])
  );
}

function falseyValue(schema: Schema): unknown | undefined {
  if (schema.enum) return undefined;
  if (schema.type === 'boolean') return false;
  if ((schema.type === 'integer' || schema.type === 'number') && (schema.minimum ?? 0) <= 0) {
    return 0;
  }
  if (schema.type === 'string' && (schema.minLength ?? 0) === 0) return '';
  if (schema.type === 'array' && (schema.minItems ?? 0) === 0) return [];
  if (schema.type === 'object' && !schema.required?.length) return {};
  return undefined;
}

function casesFor(toolName: string, schema: Schema): Array<{ variant: string; input: object }> {
  const properties = schema.properties ?? {};
  const required = requiredInput(schema);
  const cases = [{ variant: 'defaults', input: required }];
  if (Object.keys(properties).length > Object.keys(required).length) {
    cases.push({
      variant: 'all-options',
      input: Object.fromEntries(
        Object.entries(properties).map(([name, property]) => [name, valueFor(name, property, true)])
      ),
    });
  }
  for (const [name, property] of Object.entries(properties)) {
    if (name in required) continue;
    cases.push({
      variant: `option-${name}`,
      input: { ...required, [name]: valueFor(name, property, true) },
    });
    const falsey = falseyValue(property);
    if (falsey !== undefined) {
      cases.push({ variant: `falsey-${name}`, input: { ...required, [name]: falsey } });
    }
  }
  if (schema.additionalProperties !== false) {
    cases.push({
      variant: 'unknown-field',
      input: { ...required, unknown_field: 'must-not-leak' },
    });
  }

  const extras: Record<string, Array<{ variant: string; input: object }>> = {
    gcal_create_event: [
      {
        variant: 'all-day',
        input: { ...required, start_time: '2026-07-20', end_time: '2026-07-21' },
      },
    ],
    gcal_update_event: [
      {
        variant: 'all-day-times',
        input: { ...required, start_time: '2026-07-20', end_time: '2026-07-21' },
      },
    ],
    gdrive_update_file: [
      {
        variant: 'content-and-mime',
        input: { ...required, content: specialStrings.content, mime_type: 'text/plain' },
      },
    ],
    gmail_create_label: [
      {
        variant: 'both-colors',
        input: { ...required, background_color: '#ffffff', text_color: '#000000' },
      },
    ],
    gmail_get_email: [
      {
        variant: 'metadata-headers',
        input: { ...required, format: 'metadata', metadata_headers: ['Subject'] },
      },
    ],
    gmail_get_thread: [
      {
        variant: 'metadata-headers',
        input: { ...required, format: 'metadata', metadata_headers: ['Subject'] },
      },
    ],
    jira_transition_issue: [
      {
        variant: 'transition-name-only',
        input: { ...required, transitionName: 'Done' },
      },
    ],
  };
  cases.push(...(extras[toolName] ?? []));

  const seen = new Set<string>();
  return cases.filter(({ input }) => {
    const key = JSON.stringify(input);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function providerResponse(
  serviceId: string,
  toolName: string,
  input: Record<string, unknown>,
  url: URL,
  method: string
): Response {
  if (url.pathname === '/oauth/token/accessible-resources') {
    return jsonResponse([{ id: 'cloud-1', name: 'Jira', url: 'https://jira.example' }]);
  }
  if (serviceId === 'jira' && toolName === 'jira_transition_issue' && method === 'GET') {
    return jsonResponse({
      transitions: [{ id: 'transition-1', name: input.transitionName ?? 'Done' }],
    });
  }
  if (serviceId === 'discord' && url.pathname.endsWith('/users/@me/channels')) {
    return jsonResponse({ id: 'dm-channel' });
  }
  if (
    serviceId === 'gmail' &&
    ['gmail_read_emails', 'gmail_search_emails'].includes(toolName) &&
    url.pathname.endsWith('/messages')
  ) {
    return jsonResponse({ messages: [{ id: 'message-1' }], nextPageToken: 'next' });
  }
  if (
    serviceId === 'google-drive' &&
    ['gdrive_download_file', 'gdrive_export_file'].includes(toolName)
  ) {
    return new Response(Buffer.from('binary-content'), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    });
  }
  if (serviceId === 'slack') return jsonResponse({ ok: true, result: 'ok' });
  if (serviceId === 'linear') {
    return jsonResponse({
      data: {
        issueCreate: { success: true, issue: { id: 'issue-1' } },
        issueUpdate: { success: true, issue: { id: 'issue-1' } },
        issues: { nodes: [] },
        teams: { nodes: [] },
        projects: { nodes: [] },
        users: { nodes: [] },
      },
    });
  }
  if (
    (method === 'DELETE' && ['gmail', 'google-calendar', 'google-drive'].includes(serviceId)) ||
    (serviceId === 'jira' && toolName === 'jira_transition_issue' && method === 'POST')
  ) {
    return new Response(null, { status: 204 });
  }
  return jsonResponse({ id: 'result', ok: true });
}

async function responseDescriptor(response: Response): Promise<CapturedResponse> {
  const bytes = Buffer.from(await response.clone().arrayBuffer());
  return {
    status: response.status,
    headers: Object.fromEntries(
      [...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    bodyBase64: bytes.toString('base64'),
  };
}

function normalizeRequest(url: URL, init: RequestInit): object {
  const headers = new Headers(init.headers);
  return {
    method: init.method ?? 'GET',
    origin: url.origin,
    path: url.pathname,
    query: [...url.searchParams.entries()],
    headers: Object.fromEntries(
      [...headers.entries()]
        .map(([name, value]) => [name.toLowerCase(), value])
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    body: typeof init.body === 'string' ? init.body : null,
  };
}

async function main(): Promise<void> {
  const fixtures: object[] = [];
  for (const [serviceId, tools] of Object.entries(integrations)) {
    for (const [toolName, tool] of Object.entries(tools)) {
      for (const { variant, input } of casesFor(toolName, tool.definition.inputSchema as Schema)) {
        const requests: object[] = [];
        const responses: CapturedResponse[] = [];
        globalThis.fetch = (async (resource: string | URL | Request, init: RequestInit = {}) => {
          const url = new URL(
            typeof resource === 'string' || resource instanceof URL ? resource : resource.url
          );
          const method = init.method ?? 'GET';
          requests.push(normalizeRequest(url, init));
          const response = providerResponse(serviceId, toolName, input, url, method);
          responses.push(await responseDescriptor(response));
          return response;
        }) as typeof fetch;

        let result: unknown = null;
        let expectedError: { name: string; message: string } | null = null;
        try {
          result = await tool.handler(input, {
            access_token: 'provider-secret',
            token_type: 'Bearer',
            scope: 'all',
            metadata:
              serviceId === 'pipedrive'
                ? { api_base_url: 'https://acme.pipedrive.com' }
                : serviceId === 'salesforce'
                  ? { api_base_url: 'https://acme.my.salesforce.com' }
                  : undefined,
          });
        } catch (error) {
          expectedError = {
            name: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
          };
        }
        // The Python executor discovers a Jira cloud ID once per invocation and reuses it for the
        // transition-name lookup plus transition POST. The TypeScript helper rediscovers it for
        // each nested jiraRequest. Remove only that redundant second discovery from the observable
        // parity fixture; request and result semantics otherwise remain TypeScript-derived.
        if (
          serviceId === 'jira' &&
          toolName === 'jira_transition_issue' &&
          requests.length === 4 &&
          (requests[2] as { path?: string }).path === '/oauth/token/accessible-resources'
        ) {
          requests.splice(2, 1);
          responses.splice(2, 1);
        }
        fixtures.push({
          id: `${serviceId}:${toolName}:${variant}`,
          serviceId,
          toolName,
          variant,
          input,
          requests,
          responses,
          result: JSON.parse(JSON.stringify(result)),
          expectedError,
        });
      }
    }
  }

  const output = fileURLToPath(
    new URL('../tests/fixtures/typescript-provider-parity.json', import.meta.url)
  );
  const serialized = `${JSON.stringify(
    {
      schemaVersion: 2,
      generator: {
        version: 2,
        source: 'integrations/*/tools.ts exported handlers',
        capture: 'real TypeScript handler fetch requests, mocked responses, and returned results',
      },
      cases: fixtures,
    },
    null,
    2
  )}\n`;
  if (process.argv.includes('--check')) {
    const current = await readFile(output, 'utf8');
    if (current !== serialized) throw new Error('TypeScript provider parity fixture is stale');
  } else {
    await writeFile(output, serialized, 'utf8');
  }
  const toolCount = Object.values(integrations).reduce(
    (count, tools) => count + Object.keys(tools).length,
    0
  );
  console.log(
    `${process.argv.includes('--check') ? 'checked' : 'wrote'} ${fixtures.length} TypeScript-derived cases for ${toolCount} tools`
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

import type { Metadata } from 'next';
import Link from 'next/link';
import openApi from '../../../public/docs/openapi.json';
import { DocsPage } from '../../components/docs-page';
import type { DocRecord } from '../../lib/docs';
import { highlightCode } from '../../lib/highlight-code';

type Operation = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  scope?: string;
  security: string;
  responses: string[];
  requestExample?: unknown;
  responseExample?: unknown;
};

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveExample(example: unknown): unknown {
  if (!isRecord(example)) return undefined;
  if ('value' in example) return example.value;
  const reference = example.$ref;
  if (typeof reference !== 'string') return undefined;
  const prefix = '#/components/examples/';
  if (!reference.startsWith(prefix)) return undefined;
  const name = reference.slice(prefix.length);
  const component = (openApi.components.examples as Record<string, unknown>)[name];
  return isRecord(component) ? component.value : undefined;
}

function firstJsonExample(content: unknown): unknown {
  if (!isRecord(content)) return undefined;
  const mediaType = content['application/json'];
  if (!isRecord(mediaType)) return undefined;
  if ('example' in mediaType) return mediaType.example;
  if (!isRecord(mediaType.examples)) return undefined;
  for (const example of Object.values(mediaType.examples)) {
    const value = resolveExample(example);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstResponseExample(responses: unknown): unknown {
  if (!isRecord(responses)) return undefined;
  for (const [status, response] of Object.entries(responses)) {
    if (!/^[23]/.test(status) || !isRecord(response)) continue;
    const jsonExample = firstJsonExample(response.content);
    if (jsonExample !== undefined) return jsonExample;
    if (!isRecord(response.headers)) continue;
    const headers = Object.fromEntries(
      Object.entries(response.headers).flatMap(([name, header]) => {
        if (!isRecord(header) || !isRecord(header.schema) || !('example' in header.schema)) {
          return [];
        }
        return [[name, header.schema.example]];
      })
    );
    if (Object.keys(headers).length > 0) return headers;
  }
  return undefined;
}

const operations: Operation[] = Object.entries(openApi.paths).flatMap(([path, pathItem]) =>
  Object.entries(pathItem)
    .filter(([method]) => methods.has(method))
    .map(([method, rawOperation]) => {
      const operation = rawOperation as {
        operationId?: string;
        summary?: string;
        security?: Array<Record<string, unknown>>;
        responses?: Record<string, unknown>;
        requestBody?: { content?: unknown };
        'x-authlane-scope'?: string;
      };
      const schemes = operation.security ?? openApi.security;
      return {
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? `${method}-${path}`,
        summary: operation.summary ?? 'Authlane operation',
        scope: operation['x-authlane-scope'],
        security: schemes.length
          ? schemes.map((entry) => Object.keys(entry).join(', ')).join(' or ')
          : 'Public callback',
        responses: Object.keys(operation.responses ?? {}),
        requestExample: firstJsonExample(operation.requestBody?.content),
        responseExample: firstResponseExample(operation.responses),
      };
    })
);

const doc: DocRecord = {
  slug: 'api-reference',
  title: 'API reference',
  description: 'A complete, read-only view of the Authlane OpenAPI 3.1 control-plane contract.',
  source: '',
  headings: [
    { depth: 2, id: 'operations', text: 'Operations' },
    { depth: 2, id: 'webhooks', text: 'Webhooks' },
    { depth: 2, id: 'schemas', text: 'Schemas' },
  ],
  navigationGroup: 'API Documentation',
};

function HighlightedJson({ value }: { value: unknown }) {
  const code = JSON.stringify(value, null, 2);
  return (
    <pre className="docs-code language-json">
      <code
        className="language-json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism escapes the generated repository OpenAPI JSON.
        dangerouslySetInnerHTML={{ __html: highlightCode(code, 'json') }}
      />
    </pre>
  );
}

export const metadata: Metadata = {
  title: 'API reference — Authlane',
  description: doc.description,
  alternates: { canonical: 'https://authlane.io/docs/api-reference' },
  openGraph: {
    title: 'Authlane API reference',
    description: doc.description,
    url: 'https://authlane.io/docs/api-reference',
    type: 'website',
  },
};

export default function ApiReferencePage() {
  return (
    <DocsPage doc={doc}>
      <nav className="api-reference-actions" aria-label="OpenAPI specification files">
        <Link href="/docs/openapi.yaml">OpenAPI YAML</Link>
        <Link href="/docs/openapi.json">OpenAPI JSON</Link>
      </nav>

      <section aria-labelledby="operations">
        <h2 id="operations">Operations</h2>
        <p>
          Production server: <code>https://app.authlane.io</code>. Tenant API keys stay in trusted
          server code; hosted connect routes use short-lived connect sessions.
        </p>
        <div className="api-operation-list">
          {operations.map((operation) => (
            <details key={operation.operationId} className="api-operation">
              <summary>
                <span className={`api-method api-method--${operation.method.toLowerCase()}`}>
                  {operation.method}
                </span>
                <code>{operation.path}</code>
                <span>{operation.summary}</span>
              </summary>
              <dl>
                <div>
                  <dt>Operation ID</dt>
                  <dd>
                    <code>{operation.operationId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Authentication</dt>
                  <dd>{operation.security}</dd>
                </div>
                {operation.scope ? (
                  <div>
                    <dt>Required scope</dt>
                    <dd>
                      <code>{operation.scope}</code>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Responses</dt>
                  <dd>{operation.responses.join(', ')}</dd>
                </div>
              </dl>
              {operation.requestExample !== undefined ? (
                <section className="api-example" aria-label={`${operation.operationId} request`}>
                  <h3>Request example</h3>
                  <HighlightedJson value={operation.requestExample} />
                </section>
              ) : null}
              {operation.responseExample !== undefined ? (
                <section className="api-example" aria-label={`${operation.operationId} response`}>
                  <h3>Response example</h3>
                  <HighlightedJson value={operation.responseExample} />
                </section>
              ) : null}
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="webhooks">
        <h2 id="webhooks">Webhooks</h2>
        <p>
          Lifecycle webhooks are signed with the timestamp and exact raw body. Verify the HMAC
          before parsing JSON, then deduplicate deliveries with the idempotency key.
        </p>
        <h3>Webhook example</h3>
        <HighlightedJson value={openApi.components.examples.ConnectionWebhookExample.value} />
        <h3>Webhook contract</h3>
        <HighlightedJson value={openApi.webhooks} />
      </section>

      <section aria-labelledby="schemas">
        <h2 id="schemas">Schemas</h2>
        <div className="api-schema-list">
          {Object.entries(openApi.components.schemas).map(([name, schema]) => (
            <details key={name}>
              <summary>
                <code>{name}</code>
              </summary>
              <HighlightedJson value={schema} />
            </details>
          ))}
        </div>
      </section>
    </DocsPage>
  );
}

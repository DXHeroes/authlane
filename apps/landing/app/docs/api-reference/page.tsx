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
};

const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const operations: Operation[] = Object.entries(openApi.paths).flatMap(([path, pathItem]) =>
  Object.entries(pathItem)
    .filter(([method]) => methods.has(method))
    .map(([method, rawOperation]) => {
      const operation = rawOperation as {
        operationId?: string;
        summary?: string;
        security?: Array<Record<string, unknown>>;
        responses?: Record<string, unknown>;
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

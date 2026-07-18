import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

interface OpenApiOperation {
  requestBody?: {
    content?: Record<string, { schema?: object }>;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, { schema?: object }>;
    }
  >;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  webhooks: Record<string, Record<string, OpenApiOperation>>;
}

const openApi = JSON.parse(
  readFileSync(new URL('../../../landing/public/docs/openapi.json', import.meta.url), 'utf8')
) as OpenApiDocument;
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });

function operationAt(path: string, method: string): OpenApiOperation {
  const operation = openApi.paths[path]?.[method.toLowerCase()];
  if (!operation) throw new Error(`OpenAPI operation is missing: ${method.toUpperCase()} ${path}`);
  return operation;
}

function assertSchema(value: unknown, schema: object | undefined, context: string): void {
  if (!schema) throw new Error(`OpenAPI JSON schema is missing: ${context}`);
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(`${context} failed OpenAPI validation: ${ajv.errorsText(validate.errors)}`);
  }
}

export function assertOpenApiRequest(path: string, method: string, body: unknown): void {
  const schema = operationAt(path, method).requestBody?.content?.['application/json']?.schema;
  assertSchema(body, schema, `${method.toUpperCase()} ${path} request`);
}

export function assertOpenApiResponse(
  path: string,
  method: string,
  status: number,
  body: unknown
): void {
  const schema = operationAt(path, method).responses?.[String(status)]?.content?.[
    'application/json'
  ]?.schema;
  assertSchema(body, schema, `${method.toUpperCase()} ${path} ${status} response`);
}

export function assertOpenApiWebhook(body: unknown): void {
  const schema =
    openApi.webhooks.connectionLifecycle?.post.requestBody?.content?.['application/json']?.schema;
  assertSchema(body, schema, 'connectionLifecycle webhook request');
}

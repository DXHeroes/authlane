import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'apps/docs/api-reference/openapi.yaml');
const yamlPath = resolve(root, 'apps/landing/public/docs/openapi.yaml');
const jsonPath = resolve(root, 'apps/landing/public/docs/openapi.json');
const check = process.argv.includes('--check');

const source = await readFile(sourcePath, 'utf8');
const document = YAML.parse(source);
await SwaggerParser.validate(document);

if (document.openapi !== '3.1.0') {
  throw new Error(`Expected OpenAPI 3.1.0, received ${document.openapi ?? 'no version'}`);
}

const generatedJson = `${JSON.stringify(document, null, 2)}\n`;

if (check) {
  const [generatedYaml, existingJson] = await Promise.all([
    readFile(yamlPath, 'utf8'),
    readFile(jsonPath, 'utf8'),
  ]);
  if (generatedYaml !== source || existingJson !== generatedJson) {
    throw new Error('OpenAPI assets are stale. Run `pnpm openapi:generate`.');
  }
} else {
  await Promise.all([writeFile(yamlPath, source), writeFile(jsonPath, generatedJson)]);
}

console.log(check ? 'OpenAPI assets are current.' : 'Generated OpenAPI YAML and JSON assets.');

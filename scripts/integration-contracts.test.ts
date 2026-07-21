import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageRoot = join(repositoryRoot, 'packages/integration-contracts');
const manifestDirectory = join(packageRoot, 'manifests/v1');
const generatedJsonPath = join(packageRoot, 'generated/v1/integrations.json');
const generatorPath = join(packageRoot, 'scripts/generate.mjs');

const expectedCounts = {
  airtable: 11,
  attio: 37,
  discord: 4,
  github: 8,
  gmail: 11,
  'google-calendar': 7,
  'google-drive': 14,
  hubspot: 4,
  jira: 6,
  linear: 5,
  'microsoft-calendar': 13,
  'microsoft-mail': 14,
  'microsoft-sharepoint': 17,
  notion: 15,
  pipedrive: 29,
  salesforce: 5,
  slack: 5,
  stripe: 4,
} as const;

type ManifestTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

type IntegrationManifest = {
  schemaVersion: '1.0';
  serviceId: string;
  tools: ManifestTool[];
};

function readManifests(): IntegrationManifest[] {
  if (!existsSync(manifestDirectory)) return [];
  return readdirSync(manifestDirectory)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map(
      (fileName) =>
        JSON.parse(readFileSync(join(manifestDirectory, fileName), 'utf8')) as IntegrationManifest
    );
}

function sortedDefinitions(manifests: IntegrationManifest[]) {
  const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  return manifests
    .map((manifest) => ({
      schemaVersion: manifest.schemaVersion,
      serviceId: manifest.serviceId,
      tools: [...manifest.tools].sort((left, right) => compareText(left.name, right.name)),
    }))
    .sort((left, right) => compareText(left.serviceId, right.serviceId));
}

describe('canonical integration contracts', () => {
  it('contains the exact 18-service and 209-tool inventory', () => {
    const manifests = readManifests();

    expect(
      Object.fromEntries(manifests.map(({ serviceId, tools }) => [serviceId, tools.length]))
    ).toEqual(expectedCounts);
    expect(manifests.flatMap(({ tools }) => tools)).toHaveLength(209);
  });

  it('uses unique IDs and JSON object input schemas', () => {
    const manifests = readManifests();
    const serviceIds = manifests.map(({ serviceId }) => serviceId);
    const toolNames = manifests.flatMap(({ tools }) => tools.map(({ name }) => name));

    expect(new Set(serviceIds).size).toBe(serviceIds.length);
    expect(new Set(toolNames).size).toBe(toolNames.length);

    for (const manifest of manifests) {
      expect(manifest.schemaVersion).toBe('1.0');
      expect(manifest.serviceId).toMatch(/^[a-z][a-z0-9-]*$/);
      for (const tool of manifest.tools) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(tool.description.trim().length).toBeGreaterThan(0);
        expect(tool.inputSchema).toMatchObject({ type: 'object' });
        expect(Array.isArray(tool.inputSchema)).toBe(false);
        expect(tool.inputSchema.properties).toBeTypeOf('object');
        expect(tool.annotations).toEqual({
          readOnlyHint: expect.any(Boolean),
          destructiveHint: expect.any(Boolean),
          idempotentHint: expect.any(Boolean),
          openWorldHint: expect.any(Boolean),
        });
        expect(tool.annotations.destructiveHint && tool.annotations.readOnlyHint).toBe(false);
      }
    }
  });

  it('keeps generated JSON deterministic and detects stale artifacts', () => {
    expect(existsSync(generatorPath)).toBe(true);
    expect(existsSync(generatedJsonPath)).toBe(true);

    const manifests = readManifests();
    const generated = JSON.parse(readFileSync(generatedJsonPath, 'utf8')) as {
      schemaVersion: string;
      integrations: IntegrationManifest[];
    };
    expect(generated).toEqual({ schemaVersion: '1.0', integrations: sortedDefinitions(manifests) });

    const before = readFileSync(generatedJsonPath, 'utf8');
    execFileSync(process.execPath, [generatorPath], { cwd: repositoryRoot });
    expect(readFileSync(generatedJsonPath, 'utf8')).toBe(before);
    const currentCheck = spawnSync(process.execPath, [generatorPath, '--check'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(currentCheck.status).toBe(0);

    writeFileSync(generatedJsonPath, `${before}\n`);
    try {
      const staleCheck = spawnSync(process.execPath, [generatorPath, '--check'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
      expect(staleCheck.status).not.toBe(0);
      expect(`${staleCheck.stdout}${staleCheck.stderr}`).toContain('Generated artifact is stale');
    } finally {
      writeFileSync(generatedJsonPath, before);
    }
  });

  it('rejects malformed tool JSON Schemas with service and tool context', () => {
    const manifestPath = join(manifestDirectory, 'airtable.json');
    const before = readFileSync(manifestPath, 'utf8');
    const malformedManifest = JSON.parse(before) as IntegrationManifest;
    const [firstTool] = malformedManifest.tools;
    expect(firstTool?.name).toBe('airtable_create_record');
    if (!firstTool) throw new Error('Expected the canonical Airtable tool fixture');
    firstTool.inputSchema = {
      type: 'object',
      properties: {
        invalid: { type: 'not-a-json-schema-type' },
      },
    };

    writeFileSync(manifestPath, `${JSON.stringify(malformedManifest, null, 2)}\n`);
    try {
      const malformedCheck = spawnSync(process.execPath, [generatorPath, '--check'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
      expect(malformedCheck.status).not.toBe(0);
      expect(`${malformedCheck.stdout}${malformedCheck.stderr}`).toContain(
        'Invalid input schema for airtable/airtable_create_record'
      );
    } finally {
      writeFileSync(manifestPath, before);
    }
  });

  it('matches every executable TypeScript integration definition', async () => {
    const manifests = readManifests();

    for (const manifest of manifests) {
      const toolsModule = (await import(
        pathToFileURL(join(repositoryRoot, 'integrations', manifest.serviceId, 'tools.ts')).href
      )) as {
        tools: Record<string, { definition: ManifestTool }>;
      };
      const executableDefinitions = Object.values(toolsModule.tools)
        .map(({ definition }) => definition)
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

      expect(executableDefinitions, manifest.serviceId).toEqual(
        [...manifest.tools].sort((left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0
        )
      );
    }
  });
});

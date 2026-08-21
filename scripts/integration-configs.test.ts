import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { getProviderMcpPolicy } from '../packages/ai/src/provider-mcp.js';
import { productionServices } from '../packages/database/src/seed.js';
import { isServiceCategory } from '../packages/shared/src/service-categories.js';
import { SUPPORTED_SERVICE_IDS } from '../packages/shared/src/supported-services.js';

interface SourceConfig {
  id: string;
  auth_type: string;
  branding: {
    description: string;
    brand_color: string;
    initials: string;
    category: string;
  };
  config: {
    authorization_url: string;
    token_url: string;
    scopes: string[];
    default_scopes: string[];
    read_only_scopes: string[];
    docs_url: string;
    setup_guide_url: string;
    developer_console_url: string;
    execution: Record<string, unknown>;
  };
}

const root = resolve(import.meta.dirname, '..');

describe('runtime integration configuration', () => {
  it('uses Microsoft Graph delegated scopes without a provider MCP transport', () => {
    const expectations = {
      'microsoft-mail': {
        readOnly: ['offline_access', 'openid', 'profile', 'User.Read', 'Mail.Read'],
        full: ['offline_access', 'openid', 'profile', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'],
      },
      'microsoft-calendar': {
        readOnly: ['offline_access', 'openid', 'profile', 'User.Read', 'Calendars.Read'],
        full: ['offline_access', 'openid', 'profile', 'User.Read', 'Calendars.ReadWrite'],
      },
      'microsoft-sharepoint': {
        readOnly: [
          'offline_access',
          'openid',
          'profile',
          'User.Read',
          'Files.Read.All',
          'Sites.Read.All',
        ],
        full: [
          'offline_access',
          'openid',
          'profile',
          'User.Read',
          'Files.ReadWrite.All',
          'Sites.ReadWrite.All',
        ],
      },
    } as const;

    for (const [id, expected] of Object.entries(expectations)) {
      const source = YAML.parse(
        readFileSync(resolve(root, 'integrations', id, 'config.yaml'), 'utf8')
      ) as SourceConfig;
      expect(source.config.read_only_scopes).toEqual(expected.readOnly);
      expect(source.config.default_scopes).toEqual(expected.full);
      expect(source.config.execution).toEqual({ preferred: 'direct_api' });
      expect(getProviderMcpPolicy(id)).toBeUndefined();
    }
  });

  it.each(SUPPORTED_SERVICE_IDS)('%s keeps the database catalog aligned with config.yaml', (id) => {
    const source = YAML.parse(
      readFileSync(resolve(root, 'integrations', id, 'config.yaml'), 'utf8')
    ) as SourceConfig;
    const seeded = productionServices.find((service) => service.id === id);
    const seededConfig = seeded?.config as
      | {
          authorization_url?: string;
          token_url?: string;
          scopes?: Array<{ name: string }>;
          default_scopes?: string[];
          read_only_scopes?: string[];
          docs_url?: string;
          setup_guide_url?: string;
          developer_console_url?: string;
          execution?: Record<string, unknown>;
        }
      | undefined;

    expect(source.id).toBe(id);
    expect(source.auth_type).toBe('oauth2');
    expect(seeded?.authType).toBe(source.auth_type);
    expect(seededConfig).toMatchObject({
      authorization_url: source.config.authorization_url,
      token_url: source.config.token_url,
      default_scopes: source.config.default_scopes,
      read_only_scopes: source.config.read_only_scopes,
      docs_url: source.config.docs_url,
      setup_guide_url: source.config.setup_guide_url,
      developer_console_url: source.config.developer_console_url,
      execution: source.config.execution,
    });
    expect(seededConfig?.scopes?.map((scope) => scope.name)).toEqual(source.config.scopes);
  });

  it.each(SUPPORTED_SERVICE_IDS)('%s keeps MCP runtime policy aligned with config.yaml', (id) => {
    const source = YAML.parse(
      readFileSync(resolve(root, 'integrations', id, 'config.yaml'), 'utf8')
    ) as SourceConfig;
    const execution = source.config.execution as {
      preferred?: string;
      provider_mcp?: { endpoint?: string };
    };
    const runtimePolicy = getProviderMcpPolicy(id);

    if (execution.preferred === 'provider_mcp') {
      expect(runtimePolicy?.endpoint).toBe(execution.provider_mcp?.endpoint);
    } else {
      expect(runtimePolicy).toBeUndefined();
    }
  });
  it.each(SUPPORTED_SERVICE_IDS)('%s renders from config.yaml, not from the consumer', (id) => {
    // Everything a downstream application needs to draw a service card is declared here and
    // travels to the API untouched. If this drifts, the consumer's only recourse is to hardcode
    // the copy and the logo again, which is the whole thing these columns exist to stop.
    const source = YAML.parse(
      readFileSync(resolve(root, 'integrations', id, 'config.yaml'), 'utf8')
    ) as SourceConfig;
    const seeded = productionServices.find((service) => service.id === id);

    expect(seeded?.name).toBe((source as unknown as { name: string }).name);
    expect(seeded?.description).toBe(source.branding.description);
    expect(seeded?.brandColor).toBe(source.branding.brand_color);
    expect(seeded?.initials).toBe(source.branding.initials);
    expect(seeded?.category).toBe(source.branding.category);
  });

  it.each(SUPPORTED_SERVICE_IDS)('%s declares branding a card can actually use', (id) => {
    const { branding } = YAML.parse(
      readFileSync(resolve(root, 'integrations', id, 'config.yaml'), 'utf8')
    ) as SourceConfig;

    expect(branding.description.length).toBeGreaterThan(0);
    // Two lines in a card at the widget's width. Longer copy is silently clipped there, so the
    // limit belongs where an author sees it fail rather than in CSS.
    expect(branding.description.length).toBeLessThanOrEqual(140);
    expect(branding.brand_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(branding.initials).toMatch(/^[A-Z0-9]{1,2}$/);
    expect(isServiceCategory(branding.category)).toBe(true);
  });

  it('keeps branding out of the config blob the OAuth layer reads', () => {
    // `config` is mirrored field-for-field into the jsonb column and consumed as the OAuth and
    // execution contract. Display metadata living there would both break that alignment and reach
    // consumers as an untyped record.
    for (const id of SUPPORTED_SERVICE_IDS) {
      const source = YAML.parse(
        readFileSync(resolve(root, 'integrations', id, 'config.yaml'), 'utf8')
      ) as SourceConfig & { config: Record<string, unknown> };
      expect(source.config.branding).toBeUndefined();
      expect(source.config.description).toBeUndefined();
    }
  });
});

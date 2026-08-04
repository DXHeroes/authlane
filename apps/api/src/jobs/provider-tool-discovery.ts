/**
 * Asks each provider's own MCP server what tools it actually offers.
 *
 * Authlane's static contract covers a fraction of a real server — GitHub declares eight tools where
 * its official endpoint reported 47 the first time this ran in production — and execution has always
 * preferred the provider's MCP server anyway. This closes the gap on the listing side, so a model is
 * offered the whole surface rather than the part Authlane happened to hand-write.
 *
 * It runs in the worker, not on the listing path, for one reason that matters: `tools.list` does not
 * issue credentials, and that is a documented property of the product. Discovery needs an access
 * token, so it reads a stored connection credential directly, exactly as the token-refresh job
 * does, and the request path keeps reading definitions out of the database.
 */

import {
  createProviderMcpClient,
  getProviderMcpPolicy,
  type ProviderMcpClient,
  type ProviderMcpClientFactory,
  providerMcpServiceIds,
} from '@authlane/ai';
import {
  type Database,
  listProviderDiscoveryCandidates,
  type SecretStore,
  type StoredProviderTool,
  saveProviderTools,
  saveProviderToolsFailure,
  withTenantContext,
} from '@authlane/database';
import type { CacheStore } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

/** How long a provider catalogue may go unverified. */
export const PROVIDER_DISCOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Pairs per run. One provider round trip each, so a sweep stays bounded. */
export const PROVIDER_DISCOVERY_BATCH_SIZE = 10;

export interface ProviderDiscoveryResult {
  checked: number;
  updated: number;
  failed: number;
}

interface StoredCredentials {
  access_token?: string;
  token_type?: string;
  scope?: string;
}

/**
 * Describes a discovery failure so the record is diagnosable.
 *
 * The MCP SDK throws `StreamableHTTPError` for any non-2xx response, and puts the HTTP status on
 * `code` rather than in the message. Recording the message alone produced entries that quoted a
 * response body without saying what status carried it — which is the one fact needed to tell an
 * expired token from a rejected scope from a server-side quirk. The status goes first, so a
 * truncated column still shows it.
 */
function describeDiscoveryFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'Provider MCP discovery failed';

  const status = (error as { code?: unknown }).code;
  return typeof status === 'number' ? `HTTP ${status}: ${error.message}` : error.message;
}

function readAccessToken(raw: Buffer): StoredCredentials {
  try {
    return JSON.parse(raw.toString('utf8')) as StoredCredentials;
  } catch {
    return {};
  }
}

export async function discoverProviderTools(
  db: Database,
  secretStore: SecretStore,
  options: {
    cache?: CacheStore;
    clientFactory?: ProviderMcpClientFactory;
    now?: Date;
    maxAgeMs?: number;
    batchSize?: number;
  } = {}
): Promise<ProviderDiscoveryResult> {
  const now = options.now ?? new Date();
  const clientFactory = options.clientFactory ?? createProviderMcpClient;
  const staleBefore = new Date(now.getTime() - (options.maxAgeMs ?? PROVIDER_DISCOVERY_MAX_AGE_MS));

  const candidates = await listProviderDiscoveryCandidates(
    db,
    providerMcpServiceIds(),
    staleBefore,
    options.batchSize ?? PROVIDER_DISCOVERY_BATCH_SIZE
  );

  let updated = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const policy = getProviderMcpPolicy(candidate.serviceId);
    if (!policy) continue;

    try {
      const buffer = await secretStore.read(
        candidate.credentialSecretId,
        candidate.organizationId,
        'connection_credentials'
      );
      let credentials: StoredCredentials;
      try {
        credentials = readAccessToken(buffer);
      } finally {
        // The token never outlives this block in plaintext.
        buffer.fill(0);
      }

      if (!credentials.access_token) {
        await withTenantContext(db, candidate.organizationId, () =>
          saveProviderToolsFailure(
            db,
            candidate.organizationId,
            candidate.serviceId,
            'Stored credential carries no access token'
          )
        );
        failed += 1;
        continue;
      }

      if (policy.requiredScope && !credentials.scope?.split(' ').includes(policy.requiredScope)) {
        await withTenantContext(db, candidate.organizationId, () =>
          saveProviderToolsFailure(
            db,
            candidate.organizationId,
            candidate.serviceId,
            `Connection is missing the ${policy.requiredScope} scope the provider MCP server requires`
          )
        );
        failed += 1;
        continue;
      }

      // Asked without a credential first. Google's endpoints serve tools/list openly and then stamp
      // 401 on the very same body when a token they dislike is attached — which is how this sweep
      // reported failure while holding the catalogue it wanted. Where a provider answers openly,
      // sending a user's token achieves nothing and only widens where that token has been.
      const attempts: Array<{ label: 'anonymous' | 'authenticated'; accessToken: string }> = [
        { label: 'anonymous', accessToken: '' },
        { label: 'authenticated', accessToken: credentials.access_token },
      ];

      let definitions: Awaited<ReturnType<ProviderMcpClient['listToolDefinitions']>> | null = null;
      let lastFailure: unknown;

      for (const attempt of attempts) {
        const client = await clientFactory({
          endpoint: policy.endpoint,
          accessToken: attempt.accessToken,
          tokenType: credentials.token_type ?? 'Bearer',
        });
        try {
          definitions = await client.listToolDefinitions();
          break;
        } catch (error) {
          lastFailure = error;
        } finally {
          await client.close().catch(() => undefined);
        }
      }

      if (!definitions) throw lastFailure ?? new Error('Provider MCP discovery failed');

      {
        const tools: StoredProviderTool[] = definitions.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          declaredAnnotations: tool.declaredAnnotations,
        }));

        await withTenantContext(db, candidate.organizationId, () =>
          saveProviderTools(db, candidate.organizationId, candidate.serviceId, tools)
        );
        await options.cache?.delete(`control-plane:tenant-services:${candidate.organizationId}`);
        updated += 1;
      }
    } catch (error) {
      // A provider that is unreachable, rate limiting, or refusing the token must not take away the
      // catalogue Authlane already has. The failure is recorded and the last good list stands.
      const message = describeDiscoveryFailure(error);
      await withTenantContext(db, candidate.organizationId, () =>
        saveProviderToolsFailure(db, candidate.organizationId, candidate.serviceId, message)
      ).catch(() => undefined);
      failed += 1;
    }
  }

  if (candidates.length > 0) {
    logger.info(
      { checked: candidates.length, updated, failed },
      'Discovered provider MCP tool catalogues'
    );
  }

  return { checked: candidates.length, updated, failed };
}

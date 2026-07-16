import { createHmac } from 'node:crypto';
import {
  and,
  connections,
  createDatabaseSecretStore,
  type Database,
  eq,
  lt,
  lte,
  or,
  organization,
  outboxEvents,
  type SecretStore,
} from '@authlane/database';
import { postWebhook, validateWebhookUrl } from '../lib/webhook-http.js';

export interface WebhookEvent {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

export interface WebhookConfig {
  url: string;
  secret: string | Buffer;
}

export function signWebhook(secret: string | Buffer, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export async function deliverWebhook(
  fetchFn: typeof fetch | undefined,
  event: WebhookEvent,
  config: WebhookConfig,
  now: Date = new Date()
): Promise<{ delivered: boolean; error: string | null }> {
  const timestamp = Math.floor(now.getTime() / 1_000).toString();
  const body = JSON.stringify({
    id: event.id,
    type: event.eventType,
    createdAt: event.createdAt.toISOString(),
    data: event.payload,
  });
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': event.id,
    'X-Authlane-Event': event.eventType,
    'X-Authlane-Timestamp': timestamp,
    'X-Authlane-Signature': signWebhook(config.secret, timestamp, body),
  };
  try {
    validateWebhookUrl(config.url);
    const response = fetchFn
      ? await fetchFn(config.url, {
          method: 'POST',
          headers,
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        })
      : await postWebhook(config.url, headers, body);
    return response.ok
      ? { delivered: true, error: null }
      : { delivered: false, error: `Webhook returned HTTP ${response.status}` };
  } catch {
    return { delivered: false, error: 'Webhook request failed security validation or delivery' };
  }
}

interface StoredWebhookConfig {
  url: string;
  secretId: string;
}

function webhookConfig(metadata: string | null): StoredWebhookConfig | null {
  if (!metadata) return null;
  try {
    const settings = JSON.parse(metadata) as {
      webhookUrl?: unknown;
      webhookSecretId?: unknown;
    };
    return typeof settings.webhookUrl === 'string' && typeof settings.webhookSecretId === 'string'
      ? { url: settings.webhookUrl, secretId: settings.webhookSecretId }
      : null;
  } catch {
    return null;
  }
}

export async function processOutboxBatch(
  db: Database,
  fetchFn?: typeof fetch,
  now: Date = new Date(),
  secretStore: SecretStore = createDatabaseSecretStore(db)
): Promise<number> {
  const staleProcessing = new Date(now.getTime() - 5 * 60_000);
  const pending = await db
    .select()
    .from(outboxEvents)
    .where(
      or(
        and(eq(outboxEvents.status, 'pending'), lte(outboxEvents.availableAt, now)),
        and(eq(outboxEvents.status, 'processing'), lt(outboxEvents.processingAt, staleProcessing))
      )
    )
    .limit(25);

  let processed = 0;
  for (const event of pending) {
    const [claimed] = await db
      .update(outboxEvents)
      .set({ status: 'processing', processingAt: now })
      .where(
        and(
          eq(outboxEvents.id, event.id),
          or(
            eq(outboxEvents.status, 'pending'),
            and(
              eq(outboxEvents.status, 'processing'),
              lt(outboxEvents.processingAt, staleProcessing)
            )
          )
        )
      )
      .returning({ id: outboxEvents.id });
    if (!claimed) continue;

    const [tenant] = await db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, event.organizationId))
      .limit(1);
    const storedConfig = webhookConfig(tenant?.metadata ?? null);
    if (!storedConfig) {
      await db
        .update(outboxEvents)
        .set({ status: 'delivered', deliveredAt: now, processingAt: null })
        .where(eq(outboxEvents.id, event.id));
      processed += 1;
      continue;
    }

    let result: Awaited<ReturnType<typeof deliverWebhook>>;
    const secret = await secretStore.read(
      storedConfig.secretId,
      event.organizationId,
      'webhook_signing_secret'
    );
    try {
      result = await deliverWebhook(fetchFn, event, { url: storedConfig.url, secret }, now);
    } finally {
      secret.fill(0);
    }
    const attempts = event.attempts + 1;
    await db
      .update(outboxEvents)
      .set(
        result.delivered
          ? {
              status: 'delivered',
              attempts,
              deliveredAt: now,
              processingAt: null,
              lastError: null,
            }
          : {
              status: attempts >= 10 ? 'failed' : 'pending',
              attempts,
              availableAt: new Date(now.getTime() + Math.min(3_600_000, 2 ** attempts * 1_000)),
              processingAt: null,
              lastError: result.error,
            }
      )
      .where(eq(outboxEvents.id, event.id));
    processed += 1;
  }
  return processed;
}

export async function markExpiredConnections(
  db: Database,
  now: Date = new Date()
): Promise<number> {
  const expired = await db
    .select()
    .from(connections)
    .where(and(eq(connections.status, 'connected'), lte(connections.expiresAt, now)))
    .limit(100);
  let transitioned = 0;
  for (const connection of expired) {
    const didTransition = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(connections)
        .set({ status: 'expired', version: connection.version + 1, updatedAt: now })
        .where(
          and(
            eq(connections.id, connection.id),
            eq(connections.status, 'connected'),
            eq(connections.version, connection.version)
          )
        )
        .returning({ id: connections.id });
      if (!updated) return false;
      await tx.insert(outboxEvents).values({
        organizationId: connection.organizationId,
        eventType: 'connection.expired',
        payload: {
          externalUserId: connection.externalUserId,
          serviceId: connection.serviceId,
          connectionId: connection.id,
          expiresAt: connection.expiresAt?.toISOString() ?? null,
        },
      });
      return true;
    });
    if (didTransition) transitioned += 1;
  }
  return transitioned;
}

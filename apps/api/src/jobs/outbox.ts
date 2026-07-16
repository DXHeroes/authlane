import { createHmac } from 'node:crypto';
import type { Database } from '@authlane/database';
import { and, connections, eq, lte, organization, outboxEvents } from '@authlane/database';

export interface WebhookEvent {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

export interface WebhookConfig {
  url: string;
  secret: string;
}

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export async function deliverWebhook(
  fetchFn: typeof fetch,
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
  try {
    const response = await fetchFn(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': event.id,
        'X-Authlane-Event': event.eventType,
        'X-Authlane-Timestamp': timestamp,
        'X-Authlane-Signature': signWebhook(config.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok
      ? { delivered: true, error: null }
      : { delivered: false, error: `Webhook returned HTTP ${response.status}` };
  } catch (error) {
    return {
      delivered: false,
      error: error instanceof Error ? error.message : 'Webhook request failed',
    };
  }
}

function webhookConfig(metadata: string | null): WebhookConfig | null {
  if (!metadata) return null;
  try {
    const settings = JSON.parse(metadata) as {
      webhookUrl?: unknown;
      webhookSecret?: unknown;
    };
    return typeof settings.webhookUrl === 'string' && typeof settings.webhookSecret === 'string'
      ? { url: settings.webhookUrl, secret: settings.webhookSecret }
      : null;
  } catch {
    return null;
  }
}

export async function processOutboxBatch(
  db: Database,
  fetchFn: typeof fetch = fetch,
  now: Date = new Date()
): Promise<number> {
  const pending = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.status, 'pending'), lte(outboxEvents.availableAt, now)))
    .limit(25);

  let processed = 0;
  for (const event of pending) {
    const [claimed] = await db
      .update(outboxEvents)
      .set({ status: 'processing' })
      .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, 'pending')))
      .returning({ id: outboxEvents.id });
    if (!claimed) continue;

    const [tenant] = await db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, event.organizationId))
      .limit(1);
    const config = webhookConfig(tenant?.metadata ?? null);
    if (!config) {
      await db
        .update(outboxEvents)
        .set({ status: 'delivered', deliveredAt: now })
        .where(eq(outboxEvents.id, event.id));
      processed += 1;
      continue;
    }

    const result = await deliverWebhook(fetchFn, event, config, now);
    const attempts = event.attempts + 1;
    await db
      .update(outboxEvents)
      .set(
        result.delivered
          ? { status: 'delivered', attempts, deliveredAt: now, lastError: null }
          : {
              status: attempts >= 10 ? 'failed' : 'pending',
              attempts,
              availableAt: new Date(now.getTime() + Math.min(3_600_000, 2 ** attempts * 1_000)),
              lastError: result.error?.slice(0, 1_000) ?? 'Webhook delivery failed',
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
    const [updated] = await db
      .update(connections)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(connections.id, connection.id), eq(connections.status, 'connected')))
      .returning({ id: connections.id });
    if (!updated) continue;
    await db.insert(outboxEvents).values({
      organizationId: connection.organizationId,
      eventType: 'connection.expired',
      payload: {
        externalUserId: connection.externalUserId,
        serviceId: connection.serviceId,
        connectionId: connection.id,
        expiresAt: connection.expiresAt?.toISOString() ?? null,
      },
    });
    transitioned += 1;
  }
  return transitioned;
}

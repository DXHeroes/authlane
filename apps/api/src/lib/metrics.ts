import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register,
  prefix: 'authlane_',
});

// HTTP Request metrics
export const httpRequestDuration = new Histogram({
  name: 'authlane_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'authlane_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// OAuth metrics
export const oauthFlowsTotal = new Counter({
  name: 'authlane_oauth_flows_total',
  help: 'Total number of OAuth flows',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const oauthFlowDuration = new Histogram({
  name: 'authlane_oauth_flow_duration_seconds',
  help: 'Duration of OAuth flows in seconds',
  labelNames: ['provider'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Database metrics
export const databaseQueryDuration = new Histogram({
  name: 'authlane_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const databaseQueryTotal = new Counter({
  name: 'authlane_database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// Active connections gauge
export const activeConnections = new Gauge({
  name: 'authlane_active_connections',
  help: 'Number of active OAuth connections',
  labelNames: ['provider'],
  registers: [register],
});

// Token refresh metrics
export const tokenRefreshTotal = new Counter({
  name: 'authlane_token_refresh_total',
  help: 'Total number of token refresh attempts',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const tokenRefreshDuration = new Histogram({
  name: 'authlane_token_refresh_duration_seconds',
  help: 'Duration of token refresh in seconds',
  labelNames: ['provider'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Rate limit metrics
export const rateLimitHits = new Counter({
  name: 'authlane_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint'],
  registers: [register],
});

// Error metrics
export const errorTotal = new Counter({
  name: 'authlane_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'endpoint'],
  registers: [register],
});

// Webhook metrics
export const webhookDeliveryTotal = new Counter({
  name: 'authlane_webhook_delivery_total',
  help: 'Total number of webhook deliveries',
  labelNames: ['event', 'status'],
  registers: [register],
});

export const webhookDeliveryDuration = new Histogram({
  name: 'authlane_webhook_delivery_duration_seconds',
  help: 'Duration of webhook deliveries in seconds',
  labelNames: ['event'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Cache metrics (Redis)
export const cacheHits = new Counter({
  name: 'authlane_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['key_pattern'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'authlane_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['key_pattern'],
  registers: [register],
});

// Helper functions
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
) {
  httpRequestDuration.labels(method, route, statusCode.toString()).observe(duration);
  httpRequestTotal.labels(method, route, statusCode.toString()).inc();
}

export function recordOAuthFlow(
  provider: string,
  status: 'success' | 'failure',
  duration?: number
) {
  oauthFlowsTotal.labels(provider, status).inc();
  if (duration !== undefined) {
    oauthFlowDuration.labels(provider).observe(duration);
  }
}

export function recordDatabaseQuery(
  operation: string,
  status: 'success' | 'failure',
  duration: number
) {
  databaseQueryDuration.labels(operation).observe(duration);
  databaseQueryTotal.labels(operation, status).inc();
}

export function recordTokenRefresh(
  provider: string,
  status: 'success' | 'failure',
  duration: number
) {
  tokenRefreshTotal.labels(provider, status).inc();
  tokenRefreshDuration.labels(provider).observe(duration);
}

export function recordError(type: string, endpoint: string) {
  errorTotal.labels(type, endpoint).inc();
}

export function recordRateLimitHit(endpoint: string) {
  rateLimitHits.labels(endpoint).inc();
}

export function recordWebhookDelivery(
  event: string,
  status: 'success' | 'failure',
  duration: number
) {
  webhookDeliveryTotal.labels(event, status).inc();
  webhookDeliveryDuration.labels(event).observe(duration);
}

export function recordCacheHit(keyPattern: string) {
  cacheHits.labels(keyPattern).inc();
}

export function recordCacheMiss(keyPattern: string) {
  cacheMisses.labels(keyPattern).inc();
}

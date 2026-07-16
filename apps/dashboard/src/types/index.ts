import type { ApiScope } from '@authlane/shared/api-scopes';

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: string;
}

/**
 * Service configuration based on auth type
 */
export interface ServiceConfig {
  // Common fields
  api_base_url?: string;
  docs_url?: string;
  setup_guide_url?: string;
  developer_console_url?: string;
  example_call?: string;
  description?: string;
  rate_limit?: string;
  endpoints?: Array<{ path: string; method: string; description: string }>;

  // API Key specific
  auth_header?: string;
  auth_prefix?: string;
  auth_type?: 'header' | 'query_param' | 'path';
  auth_param?: string;
  additional_headers?: Record<string, string>;

  // OAuth specific
  authorization_url?: string;
  token_url?: string;
  revoke_url?: string;
  scopes?: Array<{ name: string; description: string; required?: boolean }>;
  default_scopes?: string[];
  pkce_required?: boolean;
  supports_refresh_token?: boolean;
}

export interface Service {
  id: string;
  name: string;
  authType: 'oauth2' | 'api_key' | 'none';
  config: ServiceConfig;
  enabled: boolean;
}

export interface OrganizationService {
  organizationId: string;
  serviceId: string;
  enabled: boolean;
  // OAuth credentials
  customClientId?: string;
  customClientSecret?: string;
  // API Key credential
  apiKey?: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: string;
  scope: 'user' | 'organization';
  userId?: string;
  organizationId?: string;
  serviceId: string;
  externalUserId?: string;
  status: 'active' | 'expired' | 'error';
  createdAt: string;
  updatedAt: string;
  lastHealthCheck?: string;
}

export interface DashboardStats {
  totalConnections: number;
  activeUsers: number;
  apiCalls7Days: number;
  services: {
    enabled: number;
    total: number;
  };
}

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiScope[];
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string;
}

export interface OrganizationSettings {
  organizationId: string;
  webhookUrl?: string;
  webhookSecretConfigured: boolean;
  rotateWebhookSecret?: boolean;
  newWebhookSecret?: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  customDomain?: string;
  updatedAt: string;
}

// Legacy types for backwards compatibility
export type Tenant = Organization;
export type TenantService = OrganizationService;
export type TenantSettings = OrganizationSettings;
export interface AuthResponse {
  token: string;
  tenant: Organization;
}

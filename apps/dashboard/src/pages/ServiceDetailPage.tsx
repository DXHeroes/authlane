import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Callout from '@/components/ui/Callout';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import type { OrganizationService, Service, ServiceConfig, ServiceTool } from '@/types';

/** One reading of an HTTP verb, so the endpoint table cannot disagree with itself. */
const METHOD_TONES: Record<string, BadgeTone> = {
  GET: 'success',
  POST: 'info',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'danger',
};

/**
 * Copy text to clipboard with fallback
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const AUTH_TYPE_BADGES: Record<string, { label: string; tone: BadgeTone }> = {
  oauth2: { label: 'OAuth 2.0', tone: 'info' },
  api_key: { label: 'API Key', tone: 'warning' },
  none: { label: 'Public API', tone: 'success' },
};

function AuthTypeBadge({ authType }: { authType: string }) {
  const badge = AUTH_TYPE_BADGES[authType] ?? AUTH_TYPE_BADGES.none;

  return (
    <Badge tone={badge.tone} className="px-3 py-1 text-sm">
      {badge.label}
    </Badge>
  );
}

/**
 * OAuth Configuration Section
 */
function OAuthConfigSection({
  service,
  orgService,
  onSave,
  isSaving,
}: {
  service: Service;
  orgService?: OrganizationService;
  onSave: (data: { customClientId?: string; customClientSecret?: string }) => void;
  isSaving: boolean;
}) {
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);
  const config = service.config as ServiceConfig;

  useEffect(() => {
    if (orgService?.customClientId) {
      setCustomClientId(orgService.customClientId);
    }
  }, [orgService]);

  const handleCopyRedirectUri = async () => {
    if (!orgService?.redirectUri) return;
    if (await copyToClipboard(orgService.redirectUri)) {
      setCopiedRedirectUri(true);
      setTimeout(() => setCopiedRedirectUri(false), 2000);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      customClientId: customClientId || undefined,
      customClientSecret: customClientSecret || undefined,
    });
    setCustomClientSecret('');
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">OAuth Configuration</h2>
        <AuthTypeBadge authType="oauth2" />
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Configure custom OAuth credentials for {service.name}. Leave blank to use default Authlane
        credentials.
      </p>

      {orgService?.redirectUri && (
        <Callout className="mb-6" tone="info" title="Redirect URI">
          <p className="mb-2">
            Register this exact URI in the provider's console before saving a client ID here. The
            provider rejects the sign-in if it does not match.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={orgService.redirectUri}
              className="min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={handleCopyRedirectUri}
              className="rounded-md bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              {copiedRedirectUri ? 'Copied' : 'Copy'}
            </button>
          </div>
        </Callout>
      )}

      {config.developer_console_url && (
        <Callout className="mb-6" tone="info" title="Developer console">
          <a
            href={config.developer_console_url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-4 hover:no-underline"
          >
            {config.developer_console_url} &rarr;
          </a>
        </Callout>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="clientId" className="block text-sm font-medium">
            Client ID
          </label>
          <input
            id="clientId"
            type="text"
            value={customClientId}
            onChange={(e) => setCustomClientId(e.target.value)}
            placeholder="Enter custom OAuth client ID"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="clientSecret" className="block text-sm font-medium">
            Client Secret
          </label>
          <input
            id="clientSecret"
            type="password"
            value={customClientSecret}
            onChange={(e) => setCustomClientSecret(e.target.value)}
            placeholder="Enter custom OAuth client secret"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Client secret is encrypted and never displayed after saving
          </p>
        </div>

        {config.authorization_url && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">Authorization URL:</p>
            <code className="mt-1 block text-xs break-all">{config.authorization_url}</code>
          </div>
        )}

        {config.scopes && config.scopes.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Available Scopes:</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {config.scopes.map((scope) => (
                <div key={scope.name} className="flex items-start gap-2 text-xs">
                  <span className="rounded bg-secondary px-2 py-0.5 font-mono">{scope.name}</span>
                  {scope.required && <Badge tone="danger">required</Badge>}
                  <span className="text-muted-foreground">{scope.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {config.pkce_required && (
          <Callout tone="warning">
            <strong>PKCE required:</strong> this service requires Proof Key for Code Exchange.
          </Callout>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}

/**
 * API Key Configuration Section
 */
function ApiKeyConfigSection({
  service,
  orgService,
  onSave,
  isSaving,
}: {
  service: Service;
  orgService?: OrganizationService;
  onSave: (data: { apiKey?: string }) => void;
  isSaving: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  const config = service.config as ServiceConfig;
  const hasExistingKey = Boolean(orgService?.apiKey);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ apiKey: apiKey || undefined });
    setApiKey('');
  };

  const authHeaderExample = config.auth_prefix
    ? `${config.auth_header || 'Authorization'}: ${config.auth_prefix} YOUR_API_KEY`
    : `${config.auth_header || 'Authorization'}: YOUR_API_KEY`;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">API Key Configuration</h2>
        <AuthTypeBadge authType="api_key" />
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        {config.description || `Configure your API key for ${service.name}.`}
      </p>

      {config.setup_guide_url && (
        <Callout className="mb-6" tone="warning" title="Get your API key">
          <a
            href={config.setup_guide_url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-4 hover:no-underline"
          >
            {config.setup_guide_url} &rarr;
          </a>
        </Callout>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="apiKey" className="block text-sm font-medium">
            API Key {hasExistingKey && <span className="text-success">(configured)</span>}
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasExistingKey ? 'Enter new API key to replace existing' : 'Enter your API key'
            }
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            API key is encrypted and never displayed after saving
          </p>
        </div>

        <div className="rounded-md bg-muted p-3">
          <p className="text-sm font-medium">Authentication Header Format:</p>
          <code className="mt-1 block text-xs font-mono">{authHeaderExample}</code>
        </div>

        {config.api_base_url && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">API Base URL:</p>
            <code className="mt-1 block text-xs">{config.api_base_url}</code>
          </div>
        )}

        {config.rate_limit && (
          <div className="text-sm text-muted-foreground">
            <strong>Rate Limit:</strong> {config.rate_limit}
          </div>
        )}

        {config.docs_url && (
          <div>
            <a
              href={config.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              View API Documentation →
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving || !apiKey}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : hasExistingKey ? 'Update API Key' : 'Save API Key'}
        </button>
      </form>
    </div>
  );
}

/**
 * Public API Info Section
 */
function PublicApiSection({ service }: { service: Service }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const config = service.config as ServiceConfig;

  const handleCopyUrl = async () => {
    if (config.api_base_url) {
      const success = await copyToClipboard(config.api_base_url);
      if (success) {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">Public API</h2>
        <AuthTypeBadge authType="none" />
      </div>

      <Callout className="mb-6" tone="success" title="No authentication required">
        {config.description || 'This is a public API that can be used without any credentials.'}
      </Callout>

      {config.api_base_url && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">API Base URL:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono">
              {config.api_base_url}
            </code>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="rounded-md bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              {copiedUrl ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {config.endpoints && config.endpoints.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Available Endpoints:</p>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Method</th>
                  <th className="px-3 py-2 text-left font-medium">Path</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {config.endpoints.map((endpoint) => (
                  <tr key={`${endpoint.method}:${endpoint.path}`}>
                    <td className="px-3 py-2">
                      <Badge tone={METHOD_TONES[endpoint.method] ?? 'neutral'}>
                        {endpoint.method}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{endpoint.path}</td>
                    <td className="px-3 py-2 text-muted-foreground">{endpoint.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {config.example_call && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Example Call:</p>
          <div className="rounded-md border border-border bg-muted p-3">
            <code className="break-all font-mono text-sm">{config.example_call}</code>
          </div>
        </div>
      )}

      {config.rate_limit && (
        <div className="mb-4 text-sm">
          <strong>Rate Limit:</strong>{' '}
          <span className="text-muted-foreground">{config.rate_limit}</span>
        </div>
      )}

      {config.docs_url && (
        <div>
          <a
            href={config.docs_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View Documentation →
          </a>
        </div>
      )}
    </div>
  );
}

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', id],
    queryFn: () => api.get<Service>(`/services/${id}`),
  });

  const { data: orgService } = useQuery({
    queryKey: ['org-service', id],
    queryFn: () => api.get<OrganizationService>(`/organization/services/${id}`).catch(() => null),
  });

  const { data: serviceTools = [] } = useQuery({
    queryKey: ['service-tools', id, orgService?.toolAccessPolicy],
    queryFn: () => api.get<ServiceTool[]>(`/organization/services/${id}/tools`),
    enabled: Boolean(id),
  });

  const toggleServiceMutation = useMutation({
    mutationFn: (enabled: boolean) => api.put(`/organization/services/${id}`, { enabled }),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['org-service', id] });
      queryClient.invalidateQueries({ queryKey: ['org-services'] });
      queryClient.invalidateQueries({ queryKey: ['service-tools', id] });
      toastSuccess(`${service?.name ?? 'Service'} ${enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (error) => toastError(error, 'Could not change the service.'),
  });

  const updateToolPolicyMutation = useMutation({
    mutationFn: (toolAccessPolicy: 'read_only' | 'full') =>
      api.put(`/organization/services/${id}`, { toolAccessPolicy }),
    onSuccess: (_data, toolAccessPolicy) => {
      queryClient.invalidateQueries({ queryKey: ['org-service', id] });
      queryClient.invalidateQueries({ queryKey: ['org-services'] });
      toastSuccess(
        toolAccessPolicy === 'read_only' ? 'Limited to read-only tools' : 'Full tool set allowed'
      );
    },
    onError: (error) => toastError(error, 'Could not change the tool policy.'),
  });

  const updateConfigMutation = useMutation({
    mutationFn: (data: { customClientId?: string; customClientSecret?: string; apiKey?: string }) =>
      api.put(`/organization/services/${id}/config`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-service', id] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      toastSuccess('Configuration saved');
    },
    onError: (error) => toastError(error, 'Could not save the configuration.'),
  });

  if (isLoading) {
    return (
      <div className="p-6 sm:p-8">
        <LoadingRegion label="Loading service">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-4 h-4 w-80" />
          <Skeleton className="mt-8 h-64" />
        </LoadingRegion>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Service not found</div>
      </div>
    );
  }

  const isEnabled = Boolean(orgService?.enabled);

  return (
    <div className="p-8">
      <button
        type="button"
        onClick={() => navigate('/dashboard/services')}
        className="mb-6 text-sm text-primary hover:underline"
      >
        ← Back to Services
      </button>

      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-2xl font-bold text-primary">
            {service.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{service.name}</h1>
              <AuthTypeBadge authType={service.authType} />
            </div>
            {service.config?.description && (
              <p className="mt-1 text-muted-foreground">{service.config.description}</p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => toggleServiceMutation.mutate(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-sm font-medium">{isEnabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {success && (
        <Callout className="mb-6" tone="success">
          Configuration saved.
        </Callout>
      )}

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Tool access</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Read-only exposes only safe retrieval tools. Full also exposes create, update, and delete
          tools. Changing this setting requires connected users to reconnect with the matching OAuth
          scopes.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(['read_only', 'full'] as const).map((policy) => (
            <button
              key={policy}
              type="button"
              disabled={updateToolPolicyMutation.isPending}
              onClick={() => updateToolPolicyMutation.mutate(policy)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                (orgService?.toolAccessPolicy ?? 'read_only') === policy
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <span className="block font-medium">
                {policy === 'read_only' ? 'Read-only tools' : 'Full tool set'}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {policy === 'read_only'
                  ? 'List, search, and read actions only'
                  : 'Includes write and destructive actions'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Available tools</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Safety metadata follows MCP annotations and is included in SDK responses.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {serviceTools.filter((tool) => tool.enabledByPolicy).length}/{serviceTools.length}{' '}
            enabled
          </span>
        </div>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {serviceTools.map((tool) => (
            <div
              key={tool.name}
              className={`flex gap-4 p-4 ${tool.enabledByPolicy ? '' : 'opacity-50'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-sm font-medium">{tool.name}</code>
                  <Badge
                    tone={
                      tool.risk === 'read'
                        ? 'success'
                        : tool.risk === 'write'
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {tool.risk === 'read'
                      ? 'Read-only'
                      : tool.risk === 'write'
                        ? 'Writes data'
                        : 'Destructive'}
                  </Badge>
                  {!tool.enabledByPolicy && <Badge>Disabled by policy</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
              </div>
            </div>
          ))}
          {serviceTools.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No tools are published.</p>
          )}
        </div>
      </div>

      {/* Render appropriate section based on auth type */}
      {service.authType === 'oauth2' && (
        <OAuthConfigSection
          service={service}
          orgService={orgService || undefined}
          onSave={(data) => updateConfigMutation.mutate(data)}
          isSaving={updateConfigMutation.isPending}
        />
      )}

      {service.authType === 'api_key' && (
        <ApiKeyConfigSection
          service={service}
          orgService={orgService || undefined}
          onSave={(data) => updateConfigMutation.mutate(data)}
          isSaving={updateConfigMutation.isPending}
        />
      )}

      {service.authType === 'none' && <PublicApiSection service={service} />}

      {/* Fallback for unknown auth types */}
      {!['oauth2', 'api_key', 'none'].includes(service.authType) && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          Unknown authentication type: {service.authType}
        </div>
      )}
    </div>
  );
}

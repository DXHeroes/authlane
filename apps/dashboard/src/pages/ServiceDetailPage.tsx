import { useState, type FormEvent, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Service, OrganizationService, ServiceConfig } from '@/types'

/**
 * Copy text to clipboard with fallback
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Auth type badge component
 */
function AuthTypeBadge({ authType }: { authType: string }) {
  const badges = {
    oauth2: { label: 'OAuth 2.0', className: 'bg-blue-100 text-blue-800' },
    api_key: { label: 'API Key', className: 'bg-amber-100 text-amber-800' },
    none: { label: 'Public API', className: 'bg-green-100 text-green-800' },
  }
  const badge = badges[authType as keyof typeof badges] || badges.none
  
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}>
      {badge.label}
    </span>
  )
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
  service: Service
  orgService?: OrganizationService
  onSave: (data: { customClientId?: string; customClientSecret?: string }) => void
  isSaving: boolean
}) {
  const [customClientId, setCustomClientId] = useState('')
  const [customClientSecret, setCustomClientSecret] = useState('')
  const config = service.config as ServiceConfig

  useEffect(() => {
    if (orgService?.customClientId) {
      setCustomClientId(orgService.customClientId)
    }
  }, [orgService])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave({
      customClientId: customClientId || undefined,
      customClientSecret: customClientSecret || undefined,
    })
    setCustomClientSecret('')
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">OAuth Configuration</h2>
        <AuthTypeBadge authType="oauth2" />
      </div>
      
      <p className="mb-6 text-sm text-muted-foreground">
        Configure custom OAuth credentials for {service.name}. Leave blank to use default Authlane credentials.
      </p>

      {config.developer_console_url && (
        <div className="mb-6 rounded-md bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm font-medium text-blue-800">Developer Console</p>
          <a
            href={config.developer_console_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-blue-600 hover:underline"
          >
            {config.developer_console_url} →
          </a>
        </div>
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
                  <span className="rounded bg-secondary px-2 py-0.5 font-mono">
                    {scope.name}
                  </span>
                  {scope.required && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">required</span>
                  )}
                  <span className="text-muted-foreground">{scope.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {config.pkce_required && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-800">
              <strong>PKCE Required:</strong> This service requires Proof Key for Code Exchange (PKCE)
            </p>
          </div>
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
  )
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
  service: Service
  orgService?: OrganizationService
  onSave: (data: { apiKey?: string }) => void
  isSaving: boolean
}) {
  const [apiKey, setApiKey] = useState('')
  const config = service.config as ServiceConfig
  const hasExistingKey = Boolean(orgService?.apiKey)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave({ apiKey: apiKey || undefined })
    setApiKey('')
  }

  const authHeaderExample = config.auth_prefix 
    ? `${config.auth_header || 'Authorization'}: ${config.auth_prefix} YOUR_API_KEY`
    : `${config.auth_header || 'Authorization'}: YOUR_API_KEY`

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
        <div className="mb-6 rounded-md bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-medium text-amber-800">Get your API Key</p>
          <a
            href={config.setup_guide_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-amber-600 hover:underline"
          >
            {config.setup_guide_url} →
          </a>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="apiKey" className="block text-sm font-medium">
            API Key {hasExistingKey && <span className="text-green-600">(configured)</span>}
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasExistingKey ? 'Enter new API key to replace existing' : 'Enter your API key'}
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
  )
}

/**
 * Public API Info Section
 */
function PublicApiSection({ service }: { service: Service }) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const config = service.config as ServiceConfig

  const handleCopyUrl = async () => {
    if (config.api_base_url) {
      const success = await copyToClipboard(config.api_base_url)
      if (success) {
        setCopiedUrl(true)
        setTimeout(() => setCopiedUrl(false), 2000)
      }
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">Public API</h2>
        <AuthTypeBadge authType="none" />
      </div>
      
      <div className="mb-6 rounded-md bg-green-50 border border-green-200 p-4">
        <p className="text-sm font-medium text-green-800">No Authentication Required</p>
        <p className="mt-1 text-sm text-green-700">
          {config.description || 'This is a public API that can be used without any credentials.'}
        </p>
      </div>

      {config.api_base_url && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">API Base URL:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono">
              {config.api_base_url}
            </code>
            <button
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
                {config.endpoints.map((endpoint, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        endpoint.method === 'GET' ? 'bg-green-100 text-green-700' :
                        endpoint.method === 'POST' ? 'bg-blue-100 text-blue-700' :
                        endpoint.method === 'PUT' ? 'bg-amber-100 text-amber-700' :
                        endpoint.method === 'DELETE' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {endpoint.method}
                      </span>
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
          <div className="rounded-md bg-gray-900 p-3">
            <code className="text-sm text-green-400 font-mono break-all">
              {config.example_call}
            </code>
          </div>
        </div>
      )}

      {config.rate_limit && (
        <div className="mb-4 text-sm">
          <strong>Rate Limit:</strong> <span className="text-muted-foreground">{config.rate_limit}</span>
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
  )
}

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [success, setSuccess] = useState(false)

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', id],
    queryFn: () => api.get<Service>(`/services/${id}`),
  })

  const { data: orgService } = useQuery({
    queryKey: ['org-service', id],
    queryFn: () => api.get<OrganizationService>(`/organization/services/${id}`).catch(() => null),
  })

  const toggleServiceMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put(`/organization/services/${id}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-service', id] })
      queryClient.invalidateQueries({ queryKey: ['org-services'] })
    },
  })

  const updateConfigMutation = useMutation({
    mutationFn: (data: { customClientId?: string; customClientSecret?: string; apiKey?: string }) =>
      api.put(`/organization/services/${id}/config`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-service', id] })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!service) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Service not found</div>
      </div>
    )
  }

  const isEnabled = Boolean(orgService?.enabled)

  return (
    <div className="p-8">
      <button
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
          <span className="text-sm font-medium">
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {success && (
        <div className="mb-6 rounded-md bg-green-100 border border-green-300 p-3 text-sm text-green-800">
          ✓ Configuration saved successfully
        </div>
      )}

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

      {service.authType === 'none' && (
        <PublicApiSection service={service} />
      )}

      {/* Fallback for unknown auth types */}
      {!['oauth2', 'api_key', 'none'].includes(service.authType) && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          Unknown authentication type: {service.authType}
        </div>
      )}
    </div>
  )
}

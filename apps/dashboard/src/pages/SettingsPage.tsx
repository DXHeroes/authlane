import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TenantSettings } from '@/types'

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get<TenantSettings>('/settings'),
  })

  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [requestsPerMinute, setRequestsPerMinute] = useState(60)
  const [requestsPerHour, setRequestsPerHour] = useState(3600)
  const [requestsPerDay, setRequestsPerDay] = useState(86400)
  const [customDomain, setCustomDomain] = useState('')

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.webhookUrl || '')
      setWebhookSecret(settings.webhookSecret || '')
      setRequestsPerMinute(settings.rateLimit.requestsPerMinute)
      setRequestsPerHour(settings.rateLimit.requestsPerHour)
      setRequestsPerDay(settings.rateLimit.requestsPerDay)
      setCustomDomain(settings.customDomain || '')
    }
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: (data: Partial<TenantSettings>) =>
      api.put<TenantSettings>('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    updateMutation.mutate({
      webhookUrl: webhookUrl || undefined,
      webhookSecret: webhookSecret || undefined,
      rateLimit: {
        requestsPerMinute,
        requestsPerHour,
        requestsPerDay,
      },
      customDomain: customDomain || undefined,
    })
  }

  const generateWebhookSecret = () => {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    setWebhookSecret(secret)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Configure your tenant settings and integrations
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Webhook Configuration</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Receive real-time notifications about connection events (created, expired, deleted)
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="webhook-url" className="mb-2 block text-sm font-medium">
                Webhook URL
              </label>
              <input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-app.com/webhooks/authlane"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The URL where Authlane will send webhook events
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="webhook-secret" className="text-sm font-medium">
                  Webhook Secret
                </label>
                <button
                  type="button"
                  onClick={generateWebhookSecret}
                  className="text-sm text-primary hover:underline"
                >
                  Generate Secret
                </button>
              </div>
              <input
                id="webhook-secret"
                type="text"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Your webhook signing secret"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used to verify webhook signatures. Keep this secret!
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Rate Limit Configuration</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Configure API rate limits for your tenant
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="rate-minute" className="mb-2 block text-sm font-medium">
                Requests per Minute
              </label>
              <input
                id="rate-minute"
                type="number"
                value={requestsPerMinute}
                onChange={(e) => setRequestsPerMinute(Number(e.target.value))}
                min="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="rate-hour" className="mb-2 block text-sm font-medium">
                Requests per Hour
              </label>
              <input
                id="rate-hour"
                type="number"
                value={requestsPerHour}
                onChange={(e) => setRequestsPerHour(Number(e.target.value))}
                min="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="rate-day" className="mb-2 block text-sm font-medium">
                Requests per Day
              </label>
              <input
                id="rate-day"
                type="number"
                value={requestsPerDay}
                onChange={(e) => setRequestsPerDay(Number(e.target.value))}
                min="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Custom Domain</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Use your own domain for OAuth callbacks and API endpoints (Coming Soon)
          </p>

          <div>
            <label htmlFor="custom-domain" className="mb-2 block text-sm font-medium">
              Custom Domain
            </label>
            <input
              id="custom-domain"
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="auth.yourdomain.com"
              disabled
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              This feature is coming in a future update
            </p>
          </div>
        </div>

        {updateMutation.isError && (
          <div className="rounded-md border border-red-500 bg-red-50 p-4 text-sm text-red-700">
            Failed to update settings. Please try again.
          </div>
        )}

        {updateMutation.isSuccess && (
          <div className="rounded-md border border-green-500 bg-green-50 p-4 text-sm text-green-700">
            Settings updated successfully!
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              if (settings) {
                setWebhookUrl(settings.webhookUrl || '')
                setWebhookSecret(settings.webhookSecret || '')
                setRequestsPerMinute(settings.rateLimit.requestsPerMinute)
                setRequestsPerHour(settings.rateLimit.requestsPerHour)
                setRequestsPerDay(settings.rateLimit.requestsPerDay)
                setCustomDomain(settings.customDomain || '')
              }
            }}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {settings && (
        <div className="mt-8 max-w-2xl rounded-lg border border-border bg-muted p-4">
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(settings.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

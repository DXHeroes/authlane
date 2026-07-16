import {
  API_SCOPES,
  type ApiScope,
  DEFAULT_API_SCOPES,
} from '@authlane/shared/api-scopes';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { ApiKeyWithSecret } from '@/types';

interface CreateApiKeyModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const scopeOptions: Record<ApiScope, { label: string; description: string }> = {
  'catalog:read': {
    label: 'Read service catalog',
    description: 'List services and their tool definitions.',
  },
  'connections:read': {
    label: 'Read connections',
    description: 'Read connection status for end users.',
  },
  'credentials:issue': {
    label: 'Issue credential leases',
    description: 'Retrieve short-lived credentials for direct provider calls.',
  },
  'connect-sessions:create': {
    label: 'Create connect sessions',
    description: 'Create hosted connection flows for end users.',
  },
};

export default function CreateApiKeyModal({ onClose, onSuccess }: CreateApiKeyModalProps) {
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [scopes, setScopes] = useState<ApiScope[]>([...DEFAULT_API_SCOPES]);
  const [createdKey, setCreatedKey] = useState<ApiKeyWithSecret | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; expiresInDays?: number; scopes: ApiScope[] }) =>
      api.post<ApiKeyWithSecret>('/api-keys', data),
    onSuccess: (data) => {
      setCreatedKey(data);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createMutation.mutate({
      name: name.trim(),
      expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
      scopes,
    });
  };

  const toggleScope = (scope: ApiScope) => {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : API_SCOPES.filter((item) => current.includes(item) || item === scope)
    );
  };

  const handleCopy = async () => {
    if (!createdKey) return;

    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    if (createdKey) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {createdKey ? 'API Key Created' : 'Create API Key'}
          </h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {createdKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-semibold text-yellow-800">
                Important: Save this API key now!
              </p>
              <p className="text-sm text-yellow-700">
                This is the only time you will see this key. Store it securely.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">API Key Name</label>
              <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {createdKey.name}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">API Key</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdKey.key}
                  readOnly
                  className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
                />
                <button
                  onClick={handleCopy}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {copied ? (
                    <span className="flex items-center gap-1">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Copied
                    </span>
                  ) : (
                    'Copy'
                  )}
                </button>
              </div>
            </div>

            {createdKey.expiresAt && (
              <div>
                <label className="mb-2 block text-sm font-medium">Expires At</label>
                <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {new Date(createdKey.expiresAt).toLocaleString()}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                onClick={handleClose}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="key-name" className="mb-2 block text-sm font-medium">
                API Key Name
              </label>
              <input
                id="key-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Production API Key"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A descriptive name to help you identify this key
              </p>
            </div>

            <div>
              <label htmlFor="expires-in" className="mb-2 block text-sm font-medium">
                Expires In (Days)
              </label>
              <input
                id="expires-in"
                type="number"
                value={expiresInDays}
                onChange={(e) =>
                  setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="Leave empty for no expiration"
                min="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Optional: Set an expiration date for this key
              </p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Permissions</legend>
              <div className="space-y-2 rounded-md border border-border p-3">
                {API_SCOPES.map((scope) => {
                  const option = scopeOptions[scope];
                  return (
                    <label key={scope} className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="mt-1 h-4 w-4 rounded border-border"
                      />
                      <span>
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {scopes.includes('credentials:issue') && (
                <p className="mt-2 rounded-md border border-yellow-500 bg-yellow-50 p-2 text-xs text-yellow-800">
                  This key can retrieve short-lived credentials. Treat it as a high-privilege secret.
                </p>
              )}
            </fieldset>

            {createMutation.isError && (
              <div className="rounded-md border border-red-500 bg-red-50 p-3 text-sm text-red-700">
                Failed to create API key. Please try again.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !name.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create API Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

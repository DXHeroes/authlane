import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import CreateApiKeyModal from '@/components/CreateApiKeyModal';
import { api } from '@/lib/api';
import type { ApiKey } from '@/types';

export default function ApiKeysPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKey[]>('/api-keys'),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.delete(`/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleRevoke = (keyId: string, name: string) => {
    if (
      confirm(
        `Are you sure you want to revoke the API key "${name}"? This action cannot be undone.`
      )
    ) {
      revokeMutation.mutate(keyId);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="mt-2 text-muted-foreground">
            Manage API keys for programmatic access to Authlane
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create API Key
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading API keys...</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          {apiKeys && apiKeys.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Key Prefix
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Scopes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Last Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apiKeys.map((key) => {
                    const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
                    return (
                      <tr key={key.id} className="hover:bg-accent/50">
                        <td className="px-6 py-4 text-sm font-medium">{key.name}</td>
                        <td className="px-6 py-4 text-sm font-mono">{key.keyPrefix}••••••••</td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {key.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
                              >
                                {scope}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(key.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {key.expiresAt ? (
                            <span className={isExpired ? 'text-red-600' : 'text-muted-foreground'}>
                              {new Date(key.expiresAt).toLocaleDateString()}
                              {isExpired && ' (Expired)'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button
                            onClick={() => handleRevoke(key.id, key.name)}
                            disabled={revokeMutation.isPending}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="mb-4 text-muted-foreground">No API keys created yet</div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="text-primary hover:underline"
              >
                Create your first API key
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-muted p-4">
        <h3 className="mb-2 font-medium">Important Security Notes:</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>API keys are shown only once during creation. Store them securely.</li>
          <li>Never commit API keys to version control or share them publicly.</li>
          <li>Revoke any API key that may have been compromised.</li>
          <li>Use different API keys for different environments (dev, staging, production).</li>
        </ul>
      </div>

      {isCreateModalOpen && (
        <CreateApiKeyModal
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
          }}
        />
      )}
    </div>
  );
}

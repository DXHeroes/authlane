import { KeyIcon } from '@heroicons/react/16/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import CreateApiKeyModal from '@/components/CreateApiKeyModal';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonTable } from '@/components/ui/Skeleton';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import { useIsCompact } from '@/lib/use-media-query';
import type { ApiKey } from '@/types';

function ScopeList({ scopes }: { scopes: string[] }) {
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="rounded-sm bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
        >
          {scope}
        </span>
      ))}
    </div>
  );
}

export default function ApiKeysPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);
  const queryClient = useQueryClient();
  const isCompact = useIsCompact();

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKey[]>('/api-keys'),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.delete(`/api-keys/${keyId}`),
    onSuccess: (_data, keyId) => {
      const name = apiKeys?.find((key) => key.id === keyId)?.name;
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setPendingRevoke(null);
      toastSuccess(
        name ? `${name} revoked` : 'API key revoked',
        'Requests signed with it now fail.'
      );
    },
    onError: (error) => toastError(error, 'Could not revoke the API key.'),
  });

  const expiry = (key: ApiKey) => {
    if (!key.expiresAt) return <span className="text-muted-foreground">Never</span>;
    const isExpired = new Date(key.expiresAt) < new Date();
    return (
      <span className={isExpired ? 'text-destructive' : 'text-muted-foreground'}>
        {new Date(key.expiresAt).toLocaleDateString()}
        {isExpired && ' (Expired)'}
      </span>
    );
  };

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="API Keys"
        description="Manage API keys for programmatic access to Authlane."
        actions={<Button onClick={() => setIsCreateModalOpen(true)}>Create API Key</Button>}
      />

      {isLoading ? (
        <LoadingRegion label="Loading API keys">
          <SkeletonTable columns={5} />
        </LoadingRegion>
      ) : (
        <Card>
          {apiKeys && apiKeys.length > 0 ? (
            /* Seven columns do not survive a phone. Below sm the same rows read as cards. */
            isCompact ? (
              <div className="divide-y divide-border">
                {apiKeys.map((key) => (
                  <div key={key.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{key.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {key.keyPrefix}••••••••
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setPendingRevoke(key)}
                        disabled={revokeMutation.isPending}
                      >
                        Revoke
                      </Button>
                    </div>
                    <ScopeList scopes={key.scopes} />
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Last used</dt>
                        <dd>
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Expires</dt>
                        <dd>{expiry(key)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <Table caption="API keys in this organization">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Name</Th>
                    <Th>Key Prefix</Th>
                    <Th>Scopes</Th>
                    <Th>Created</Th>
                    <Th>Last Used</Th>
                    <Th>Expires</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {apiKeys.map((key) => (
                    <Tr key={key.id}>
                      <Td className="font-medium">{key.name}</Td>
                      <Td className="font-mono">{key.keyPrefix}••••••••</Td>
                      <Td>
                        <ScopeList scopes={key.scopes} />
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {new Date(key.createdAt).toLocaleString()}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                      </Td>
                      <Td className="whitespace-nowrap">{expiry(key)}</Td>
                      <Td>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setPendingRevoke(key)}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )
          ) : (
            <EmptyState icon={KeyIcon} title="No API keys yet">
              A key lets your backend read connections and issue credentials. Nothing can call the
              API until one exists.
              <div className="mt-5">
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  Create your first API key
                </Button>
              </div>
            </EmptyState>
          )}
        </Card>
      )}

      <Card className="mt-6 bg-muted">
        <div className="p-5">
          <h2 className="mb-2 font-medium">Important security notes</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>API keys are shown only once during creation. Store them securely.</li>
            <li>Never commit API keys to version control or share them publicly.</li>
            <li>Revoke any API key that may have been compromised.</li>
            <li>Use different API keys for different environments (dev, staging, production).</li>
          </ul>
        </div>
      </Card>

      {isCreateModalOpen && (
        <CreateApiKeyModal
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
          }}
        />
      )}

      {pendingRevoke && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingRevoke(null);
          }}
          title={`Revoke ${pendingRevoke.name}?`}
          confirmLabel="Revoke key"
          isPending={revokeMutation.isPending}
          onConfirm={() => revokeMutation.mutate(pendingRevoke.id)}
        >
          <p>
            Every request signed with{' '}
            <span className="font-mono text-foreground">{pendingRevoke.keyPrefix}••••••••</span>{' '}
            starts failing immediately. This cannot be undone — issue a new key to restore access.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

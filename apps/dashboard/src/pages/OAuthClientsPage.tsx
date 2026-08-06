import { PuzzlePieceIcon } from '@heroicons/react/16/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import OAuthClientModal from '@/components/OAuthClientModal';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonTable } from '@/components/ui/Skeleton';
import Switch from '@/components/ui/Switch';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import { useIsCompact } from '@/lib/use-media-query';
import { useOrganizationRole } from '@/lib/use-organization-role';
import type { OAuthClient } from '@/types';

/**
 * The applications this workspace lets people sign in to with their Authlane identity.
 *
 * Registering one is a larger act than issuing an API key: a redirect URI is where end-user
 * identities get delivered, so the API restricts every mutation here to owners and admins while
 * leaving the list open to any member. The role below decides what is *rendered*; it is never what
 * makes the request safe. The API re-checks on every call and answers 403 INSUFFICIENT_SCOPE
 * whatever the dashboard believed, which is why that answer is still handled.
 */

const NOT_PERMITTED = 'Only admins and owners can manage connected apps.';

/** Duck-typed for the same reason `errorMessage` is: page tests mock `lib/api` wholesale. */
function isInsufficientScope(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'INSUFFICIENT_SCOPE'
  );
}

function RedirectUriList({ uris }: { uris: string[] }) {
  return (
    <ul className="flex max-w-sm flex-col gap-1">
      {uris.map((uri) => (
        <li key={uri} className="break-all font-mono text-xs text-muted-foreground">
          {uri}
        </li>
      ))}
    </ul>
  );
}

export default function OAuthClientsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OAuthClient | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OAuthClient | null>(null);
  const queryClient = useQueryClient();
  const isCompact = useIsCompact();
  const { role, isLoading: isRoleLoading } = useOrganizationRole();

  const canManage = role === 'owner' || role === 'admin';

  const { data: clients, isLoading: areClientsLoading } = useQuery({
    queryKey: ['oauth-clients'],
    queryFn: () => api.get<OAuthClient[]>('/oauth-clients'),
  });

  /**
   * The role lookup and the client list are separate requests, and the role is what decides whether
   * the management controls exist at all. Rendering as soon as the list lands would show an admin
   * the read-only view for as long as the slower of the two takes, then pop the controls in.
   */
  const isLoading = areClientsLoading || isRoleLoading;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['oauth-clients'] });

  const reportFailure = (error: unknown, fallback: string) => {
    if (isInsufficientScope(error)) {
      // The API's own wording says "OAuth clients". This screen calls them connected apps, and a
      // refusal is not the moment to introduce a second name for the same thing.
      toastError(new Error(NOT_PERMITTED), NOT_PERMITTED);
      return;
    }
    toastError(error, fallback);
  };

  const toggleMutation = useMutation({
    mutationFn: (client: OAuthClient) =>
      api.patch<OAuthClient>(`/oauth-clients/${client.id}`, { disabled: !client.disabled }),
    onSuccess: (updated) => {
      invalidate();
      toastSuccess(
        updated.disabled ? `${updated.name} disabled` : `${updated.name} enabled`,
        updated.disabled
          ? 'New sign-ins through this application are refused.'
          : 'People can sign in through this application again.'
      );
    },
    onError: (error) => reportFailure(error, 'Could not change the application.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (client: OAuthClient) => api.delete(`/oauth-clients/${client.id}`),
    onSuccess: (_data, client) => {
      invalidate();
      setPendingDelete(null);
      toastSuccess(`${client.name} removed`, 'Everyone signed in through it has to pair again.');
    },
    onError: (error) => reportFailure(error, 'Could not remove the application.'),
  });

  const statusCell = (client: OAuthClient) =>
    canManage ? (
      <Switch
        checked={!client.disabled}
        label={client.name}
        disabled={toggleMutation.isPending}
        onToggle={() => toggleMutation.mutate(client)}
      />
    ) : (
      <Badge tone={client.disabled ? 'neutral' : 'success'}>
        {client.disabled ? 'Disabled' : 'Enabled'}
      </Badge>
    );

  const rowActions = (client: OAuthClient) =>
    canManage && (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditing(client)}>
          Edit
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setPendingDelete(client)}
          disabled={deleteMutation.isPending}
        >
          Remove
        </Button>
      </div>
    );

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="Connected Apps"
        description="Applications that sign people in with their Authlane workspace."
        actions={
          canManage && <Button onClick={() => setIsCreateOpen(true)}>Register application</Button>
        }
      />

      {isLoading ? (
        <LoadingRegion label="Loading connected apps">
          <SkeletonTable columns={5} />
        </LoadingRegion>
      ) : (
        <Card>
          {clients && clients.length > 0 ? (
            /* The client id and its redirect URIs are both long. Below sm the rows read as cards. */
            isCompact ? (
              <div className="divide-y divide-border">
                {clients.map((client) => (
                  <div key={client.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-medium">{client.name}</p>
                      {statusCell(client)}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Client ID</p>
                      <p className="break-all font-mono text-xs">{client.clientId}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Redirect URIs</p>
                      <RedirectUriList uris={client.redirectUris} />
                    </div>
                    {rowActions(client)}
                  </div>
                ))}
              </div>
            ) : (
              <Table caption="Applications registered by this organization">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Name</Th>
                    <Th>Client ID</Th>
                    <Th>Redirect URIs</Th>
                    <Th>Status</Th>
                    {canManage && <Th>Actions</Th>}
                  </Tr>
                </Thead>
                <Tbody>
                  {clients.map((client) => (
                    <Tr key={client.id}>
                      <Td className="font-medium">{client.name}</Td>
                      <Td className="break-all font-mono text-xs">{client.clientId}</Td>
                      <Td>
                        <RedirectUriList uris={client.redirectUris} />
                      </Td>
                      <Td>{statusCell(client)}</Td>
                      {canManage && <Td>{rowActions(client)}</Td>}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )
          ) : (
            <EmptyState icon={PuzzlePieceIcon} title="No connected apps yet">
              Register an application to let your users sign in to it with their Authlane workspace.
              {canManage ? (
                <div className="mt-5">
                  <Button onClick={() => setIsCreateOpen(true)}>Register your first app</Button>
                </div>
              ) : (
                <p className="mt-3">{NOT_PERMITTED}</p>
              )}
            </EmptyState>
          )}
        </Card>
      )}

      <Card className="mt-6 bg-muted">
        <div className="p-5">
          <h2 className="mb-2 font-medium">Configuring an application</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              Authlane is the authorization server. Its endpoints are published at{' '}
              <code className="font-mono text-xs">/api/auth/.well-known/openid-configuration</code>.
            </li>
            <li>
              Authorization code with PKCE is required, and <code className="font-mono">S256</code>{' '}
              is the only accepted challenge method.
            </li>
            <li>
              The client secret is shown once at registration and cannot be recovered. Losing it
              means registering the application again.
            </li>
            <li>
              Redirect URIs are matched exactly — no wildcards, no fragments, no trailing-slash
              differences.
            </li>
            <li>
              Only members of this organization can authorize an application it registered. Anyone
              else is refused with <code className="font-mono text-xs">access_denied</code>.
            </li>
          </ul>
        </div>
      </Card>

      {isCreateOpen && (
        <OAuthClientModal onClose={() => setIsCreateOpen(false)} onSuccess={invalidate} />
      )}

      {editing && (
        <OAuthClientModal
          client={editing}
          onClose={() => setEditing(null)}
          onSuccess={invalidate}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          title={`Remove ${pendingDelete.name}?`}
          confirmLabel="Remove application"
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete)}
        >
          <p>
            Everyone who signed in through it is disconnected, and its tokens stop working
            immediately. This cannot be undone — registering it again issues a new client ID and
            secret that the application has to be reconfigured with.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

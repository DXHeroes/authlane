import { ServerStackIcon } from '@heroicons/react/16/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonCards } from '@/components/ui/Skeleton';
import Switch from '@/components/ui/Switch';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';

interface McpServer {
  id: string;
  name: string;
  serverUrl: string;
  authType: string;
  enabled: boolean;
  /** The server will not list its tools until one of your users has authorized it. */
  authorizationRequired: boolean;
  discoveredAt: string | null;
  discoveryError: string | null;
  oauthClientId: string | null;
  createdAt: string;
}

interface McpServerPreset {
  key: string;
  name: string;
  serverUrl: string;
  authType: 'oauth2' | 'api_key';
  category: string;
  docsUrl: string;
  dynamicRegistration: boolean;
  verifiedAt: string;
}

interface McpServerTool {
  name: string;
  description: string;
  risk: 'read' | 'write' | 'destructive';
  approved: boolean;
  declaredAnnotations: Record<string, unknown> | null;
  lastSeenAt: string;
}

const RISKS = ['read', 'write', 'destructive'] as const;

const RISK_TONES: Record<McpServerTool['risk'], BadgeTone> = {
  read: 'success',
  write: 'warning',
  destructive: 'danger',
};

const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Productivity',
  engineering: 'Engineering',
  crm: 'CRM',
  design: 'Design',
  finance: 'Finance',
  infrastructure: 'Infrastructure',
  observability: 'Observability',
  security: 'Security',
};

/**
 * Compares two server URLs the way the API stores them.
 *
 * A catalogue entry is matched to a registered row by URL, and discovery normalizes what it saves —
 * `https://mcp.box.com/` comes back as `https://mcp.box.com`. Without the same normalization here a
 * server the tenant has already switched on would read as off, and clicking it would register a
 * second copy.
 */
function sameServer(left: string, right: string): boolean {
  const normalize = (value: string) => {
    try {
      return new URL(value).toString().replace(/\/$/, '').toLowerCase();
    } catch {
      return value.trim().toLowerCase();
    }
  };
  return normalize(left) === normalize(right);
}

/**
 * What a server claims about a tool, next to what Authlane enforces.
 *
 * Discovery never trusts these — a server that labels a destructive tool read-only would otherwise
 * slip through a read_only policy — so they are shown purely as context for the tenant's own call.
 */
function DeclaredHints({ annotations }: { annotations: Record<string, unknown> | null }) {
  const claimed = Object.entries(annotations ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (claimed.length === 0) return null;

  return <span className="text-xs text-muted-foreground">server claims: {claimed.join(', ')}</span>;
}

function ToolList({
  serverId,
  awaitingAuthorization,
}: {
  serverId: string;
  awaitingAuthorization: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: tools, isLoading } = useQuery({
    queryKey: ['mcp-server-tools', serverId],
    queryFn: () => api.get<McpServerTool[]>(`/organization/mcp-servers/${serverId}/tools`),
  });

  const updateTool = useMutation({
    mutationFn: ({
      name,
      ...changes
    }: {
      name: string;
      risk?: McpServerTool['risk'];
      approved?: boolean;
    }) => api.patch(`/organization/mcp-servers/${serverId}/tools/${name}`, changes),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mcp-server-tools', serverId] });
      toastSuccess(
        variables.approved === undefined
          ? `${variables.name} set to ${variables.risk}`
          : variables.approved
            ? `${variables.name} approved`
            : `${variables.name} withheld`
      );
    },
    onError: (error) => toastError(error, 'Could not update the tool.'),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading tools…</p>;
  }

  if (!tools || tools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {awaitingAuthorization
          ? 'This server lists its tools only to an authorized user, so the contract arrives with the first authorization.'
          : 'No tools discovered yet.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Discovery records every tool as <strong>write</strong>. Lower a tool to read only after you
        have checked what it does — a read_only connection may use nothing above read.
      </p>
      {tools.map((tool) => (
        <div
          key={tool.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{tool.name}</span>
              <Badge tone={RISK_TONES[tool.risk]}>{tool.risk}</Badge>
            </div>
            {tool.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
            )}
            <DeclaredHints annotations={tool.declaredAnnotations} />
          </div>

          <div className="flex items-center gap-2">
            <SelectField
              label={`Risk for ${tool.name}`}
              fieldClassName="[&>label]:sr-only"
              value={tool.risk}
              disabled={updateTool.isPending}
              onChange={(event) =>
                updateTool.mutate({
                  name: tool.name,
                  risk: event.target.value as McpServerTool['risk'],
                })
              }
            >
              {RISKS.map((risk) => (
                <option key={risk} value={risk}>
                  {risk}
                </option>
              ))}
            </SelectField>
            <Button
              variant={tool.approved ? 'secondary' : 'primary'}
              size="sm"
              disabled={updateTool.isPending}
              onClick={() => updateTool.mutate({ name: tool.name, approved: !tool.approved })}
            >
              {tool.approved ? 'Withhold' : 'Approve'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One card, whether it came from the catalogue or from a URL the tenant typed. */
function ServerCard({
  name,
  serverUrl,
  authType,
  server,
  note,
  busy,
  onEnable,
  onDisable,
  onRediscover,
}: {
  name: string;
  serverUrl: string;
  authType: string;
  /** The registered row, when this organization has this server. */
  server: McpServer | undefined;
  note?: React.ReactNode;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onRediscover: () => void;
}) {
  const [showTools, setShowTools] = useState(false);
  // Registered, not enabled: the row exists and discovery failed. Reading the card as off would
  // register a second copy of the same server on the next click.
  const registered = Boolean(server);
  const failed = Boolean(server && !server.enabled);
  const awaiting = Boolean(server?.enabled && server.authorizationRequired);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardBody>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
              {name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{name}</h3>
              <Badge tone="info">{authType === 'oauth2' ? 'OAuth 2.1' : 'API key'}</Badge>
            </div>
          </div>
          {failed && <Badge tone="danger">Not discovered</Badge>}
          {awaiting && <Badge tone="warning">Awaiting authorization</Badge>}
        </div>

        <p className="mb-2 truncate font-mono text-xs text-muted-foreground">{serverUrl}</p>
        {server && <p className="mb-2 font-mono text-xs text-muted-foreground">{server.id}</p>}

        {awaiting && (
          <p className="mb-3 text-sm text-muted-foreground">
            Registered and waiting for the first user to authorize it — this server lists its tools
            only to a credential of its own.
          </p>
        )}
        {server?.discoveryError && (
          <p className="mb-3 text-sm text-destructive">
            Last discovery failed: {server.discoveryError}
          </p>
        )}
        {!registered && note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Switch
            label={name}
            checked={registered}
            disabled={busy}
            onToggle={registered ? onDisable : onEnable}
          />

          <div className="flex items-center gap-3">
            {failed && (
              <Button variant="link" disabled={busy} onClick={onRediscover}>
                Retry discovery
              </Button>
            )}
            {server?.enabled && (
              <Button variant="link" onClick={() => setShowTools(!showTools)}>
                {showTools ? 'Hide tools' : 'Tools'}
              </Button>
            )}
          </div>
        </div>

        {showTools && server && (
          <div className="mt-4 border-t border-border pt-4">
            <ToolList serverId={server.id} awaitingAuthorization={server.authorizationRequired} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function CustomServerForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [authType, setAuthType] = useState<'oauth2' | 'api_key'>('oauth2');

  const register = useMutation({
    mutationFn: () =>
      api.post<{ id: string; enabled: boolean }>('/organization/mcp-servers', {
        name,
        serverUrl,
        authType,
      }),
    onSuccess: () => {
      toastSuccess(`${name} registered`);
      setName('');
      setServerUrl('');
      setOpen(false);
      onDone();
    },
    onError: (error) => {
      toastError(error, 'Could not register the server.');
      // Discovery may have failed after the row was created; the card has to show that.
      onDone();
    },
  });

  if (!open) {
    return (
      <Button variant="secondary" className="mb-8" onClick={() => setOpen(true)}>
        Add your own server
      </Button>
    );
  }

  return (
    <Card className="mb-8">
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Support desk"
            />
            <TextField
              label="Server URL"
              type="url"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              required
              placeholder="https://mcp.example.com"
            />
            <SelectField
              label="Authorization"
              value={authType}
              onChange={(event) => setAuthType(event.target.value as 'oauth2' | 'api_key')}
            >
              <option value="oauth2">OAuth 2.1</option>
              <option value="api_key">API key (per user)</option>
            </SelectField>
          </div>

          <p className="text-xs text-muted-foreground">
            The URL must be https and reachable from the internet. Authlane discovers the tool list
            and never relays a tool call: your runtime reaches the server directly with a leased
            credential.
          </p>

          <div className="flex items-center gap-2">
            <Button type="submit" isPending={register.isPending}>
              Register server
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default function McpServersPage() {
  const queryClient = useQueryClient();
  const [pendingRemoval, setPendingRemoval] = useState<McpServer | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => api.get<McpServer[]>('/organization/mcp-servers'),
  });

  const { data: presets } = useQuery({
    queryKey: ['mcp-presets'],
    queryFn: () => api.get<McpServerPreset[]>('/organization/mcp-servers/presets'),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    queryClient.invalidateQueries({ queryKey: ['mcp-server-tools'] });
  };

  const register = useMutation({
    mutationFn: (entry: { name: string; serverUrl: string; authType: string }) =>
      api.post('/organization/mcp-servers', entry),
    onSuccess: (_result, entry) => {
      toastSuccess(`${entry.name} turned on`);
      refreshAll();
    },
    onError: (error) => {
      toastError(error, 'Could not turn the server on.');
      // The row exists even when discovery failed, so the card has to appear and say why.
      refreshAll();
    },
  });

  const rediscover = useMutation({
    mutationFn: (serverId: string) =>
      api.post(`/organization/mcp-servers/${serverId}/discover`, {}),
    onSuccess: () => {
      toastSuccess('Discovery finished');
      refreshAll();
    },
    onError: (error) => {
      toastError(error, 'Discovery failed again.');
      refreshAll();
    },
  });

  const remove = useMutation({
    mutationFn: (serverId: string) => api.delete(`/organization/mcp-servers/${serverId}`),
    onSuccess: () => {
      toastSuccess(`${pendingRemoval?.name ?? 'Server'} turned off`);
      setPendingRemoval(null);
      refreshAll();
    },
    onError: (error) => toastError(error, 'Could not turn the server off.'),
  });

  const busy = register.isPending || remove.isPending || rediscover.isPending;

  const findServer = (serverUrl: string) =>
    servers?.find((server) => sameServer(server.serverUrl, serverUrl));

  // A registered server outside the catalogue is one the tenant runs themselves.
  const ownServers = (servers ?? []).filter(
    (server) => !presets?.some((preset) => sameServer(preset.serverUrl, server.serverUrl))
  );

  const grouped = (presets ?? []).reduce<Record<string, McpServerPreset[]>>((groups, entry) => {
    const bucket = groups[entry.category];
    if (bucket) bucket.push(entry);
    else groups[entry.category] = [entry];
    return groups;
  }, {});

  const enabledCount = servers?.filter((server) => server.enabled).length ?? 0;
  const awaitingCount =
    servers?.filter((server) => server.enabled && server.authorizationRequired).length ?? 0;

  return (
    <div className="p-8">
      <PageHeader
        title="MCP Servers"
        description="Turn on the servers you want to offer. Each of your users then authorizes one under their own account, and your runtime reaches it directly with a leased credential."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-2xl font-semibold">{presets?.length ?? 0}</div>
            <div className="text-sm text-muted-foreground">Verified servers</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-2xl font-semibold text-success">{enabledCount}</div>
            <div className="text-sm text-muted-foreground">Turned on</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-2xl font-semibold text-warning">{awaitingCount}</div>
            <div className="text-sm text-muted-foreground">Awaiting first authorization</div>
          </CardBody>
        </Card>
      </div>

      <CustomServerForm onDone={refreshAll} />

      {isLoading && (
        <LoadingRegion label="Loading MCP servers">
          <SkeletonCards count={6} />
        </LoadingRegion>
      )}

      {ownServers.length > 0 && (
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="heading-tight text-xl font-semibold">Your own servers</h2>
            <p className="text-sm text-muted-foreground">
              Servers you registered by URL. They go through the same discovery, host checks and
              per-tool review as a verified one.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ownServers.map((server) => (
              <ServerCard
                key={server.id}
                name={server.name}
                serverUrl={server.serverUrl}
                authType={server.authType}
                server={server}
                busy={busy}
                onEnable={() =>
                  register.mutate({
                    name: server.name,
                    serverUrl: server.serverUrl,
                    authType: server.authType,
                  })
                }
                onDisable={() => setPendingRemoval(server)}
                onRediscover={() => rediscover.mutate(server.id)}
              />
            ))}
          </div>
        </section>
      )}

      {Object.entries(grouped)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, entries]) => (
          <section key={category} className="mb-8">
            <h2 className="heading-tight mb-4 text-xl font-semibold">
              {CATEGORY_LABELS[category] ?? category}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => {
                const server = findServer(entry.serverUrl);
                return (
                  <ServerCard
                    key={entry.key}
                    name={entry.name}
                    serverUrl={entry.serverUrl}
                    authType={entry.authType}
                    server={server}
                    busy={busy}
                    note={
                      <>
                        {entry.dynamicRegistration
                          ? 'Authlane registers itself with this server, so there is nothing to set up.'
                          : 'This server has no dynamic registration, so you will need to add your own OAuth application under Services.'}{' '}
                        <a
                          href={entry.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Provider documentation
                        </a>
                      </>
                    }
                    onEnable={() =>
                      register.mutate({
                        name: entry.name,
                        serverUrl: entry.serverUrl,
                        authType: entry.authType,
                      })
                    }
                    onDisable={() => server && setPendingRemoval(server)}
                    onRediscover={() => server && rediscover.mutate(server.id)}
                  />
                );
              })}
            </div>
          </section>
        ))}

      {!isLoading && (!presets || presets.length === 0) && ownServers.length === 0 && (
        <Card>
          <EmptyState icon={ServerStackIcon} title="No MCP servers available">
            The verified catalogue could not be loaded, and you have not registered a server of your
            own yet.
          </EmptyState>
        </Card>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={`Turn off ${pendingRemoval?.name ?? 'this server'}?`}
        confirmLabel="Turn off"
        isPending={remove.isPending}
        onConfirm={() => pendingRemoval && remove.mutate(pendingRemoval.id)}
      >
        Everyone who authorized {pendingRemoval?.name ?? 'this server'} loses their connection, and
        this cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

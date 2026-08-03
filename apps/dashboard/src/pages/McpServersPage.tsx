import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, DashboardApiError } from '@/lib/api';

interface McpServer {
  id: string;
  name: string;
  serverUrl: string;
  authType: string;
  enabled: boolean;
  discoveredAt: string | null;
  discoveryError: string | null;
  oauthClientId: string | null;
  createdAt: string;
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

const RISK_STYLES: Record<McpServerTool['risk'], string> = {
  read: 'bg-green-100 text-green-700',
  write: 'bg-amber-100 text-amber-700',
  destructive: 'bg-red-100 text-red-700',
};

function errorMessage(error: unknown): string {
  return error instanceof DashboardApiError || error instanceof Error
    ? error.message
    : 'Something went wrong';
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

function ToolList({ serverId }: { serverId: string }) {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-server-tools', serverId] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tools...</p>;
  if (!tools || tools.length === 0) {
    return <p className="text-sm text-muted-foreground">No tools discovered yet.</p>;
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
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[tool.risk]}`}
              >
                {tool.risk}
              </span>
            </div>
            {tool.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{tool.description}</p>
            )}
            <DeclaredHints annotations={tool.declaredAnnotations} />
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`risk-${serverId}-${tool.name}`}>
              Risk for {tool.name}
            </label>
            <select
              id={`risk-${serverId}-${tool.name}`}
              value={tool.risk}
              disabled={updateTool.isPending}
              onChange={(event) =>
                updateTool.mutate({
                  name: tool.name,
                  risk: event.target.value as McpServerTool['risk'],
                })
              }
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {RISKS.map((risk) => (
                <option key={risk} value={risk}>
                  {risk}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={updateTool.isPending}
              onClick={() => updateTool.mutate({ name: tool.name, approved: !tool.approved })}
              className={`rounded-md border px-3 py-1 text-sm ${
                tool.approved
                  ? 'border-border text-muted-foreground hover:bg-muted'
                  : 'border-green-600 text-green-700 hover:bg-green-50'
              }`}
            >
              {tool.approved ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [authType, setAuthType] = useState<'oauth2' | 'api_key'>('oauth2');

  const register = useMutation({
    mutationFn: () =>
      api.post<{ id: string; enabled: boolean; tools?: number }>('/organization/mcp-servers', {
        name,
        serverUrl,
        authType,
      }),
    onSuccess: () => {
      setName('');
      setServerUrl('');
      onDone();
    },
  });

  return (
    <form
      className="mb-8 space-y-4 rounded-lg border border-border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        register.mutate();
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mcp-name">
            Name
          </label>
          <input
            id="mcp-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Support desk"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mcp-url">
            Server URL
          </label>
          <input
            id="mcp-url"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            required
            type="url"
            placeholder="https://mcp.example.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mcp-auth">
            Authorization
          </label>
          <select
            id="mcp-auth"
            value={authType}
            onChange={(event) => setAuthType(event.target.value as 'oauth2' | 'api_key')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="oauth2">OAuth 2.1</option>
            <option value="api_key">API key (per user)</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The URL must be https and reachable from the internet. Authlane discovers the tool list and
        never relays a tool call: your runtime reaches the server directly with a leased credential.
      </p>

      {register.error && <p className="text-sm text-red-600">{errorMessage(register.error)}</p>}

      <button
        type="submit"
        disabled={register.isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {register.isPending ? 'Discovering...' : 'Register server'}
      </button>
    </form>
  );
}

export default function McpServersPage() {
  const queryClient = useQueryClient();
  const [openServerId, setOpenServerId] = useState<string | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => api.get<McpServer[]>('/organization/mcp-servers'),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    queryClient.invalidateQueries({ queryKey: ['mcp-server-tools'] });
  };

  const rediscover = useMutation({
    mutationFn: (serverId: string) =>
      api.post(`/organization/mcp-servers/${serverId}/discover`, {}),
    onSuccess: refreshAll,
  });

  const remove = useMutation({
    mutationFn: (serverId: string) => api.delete(`/organization/mcp-servers/${serverId}`),
    onSuccess: refreshAll,
  });

  const handleRemove = (server: McpServer) => {
    // Removing drops every user's connection to the server along with it.
    if (
      confirm(
        `Remove "${server.name}"? Everyone who authorized it loses their connection, and this cannot be undone.`
      )
    ) {
      remove.mutate(server.id);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">MCP Servers</h1>
        <p className="mt-2 text-muted-foreground">
          Offer your own MCP servers to your users. Each user authorizes one under their own
          account.
        </p>
      </div>

      <RegisterForm onDone={refreshAll} />

      {(rediscover.error || remove.error) && (
        <p className="mb-4 text-sm text-red-600">
          {errorMessage(rediscover.error ?? remove.error)}
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Loading...</p>}

      {!isLoading && (!servers || servers.length === 0) && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No MCP servers registered yet</p>
        </div>
      )}

      <div className="space-y-4">
        {servers?.map((server) => (
          <div key={server.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{server.name}</h2>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      server.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {server.enabled ? 'Available' : 'Not discovered'}
                  </span>
                  <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {server.authType === 'oauth2' ? 'OAuth 2.1' : 'API key'}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {server.serverUrl}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{server.id}</p>
                {server.discoveryError && (
                  <p className="mt-2 text-sm text-red-600">
                    Last discovery failed: {server.discoveryError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenServerId(openServerId === server.id ? null : server.id)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {openServerId === server.id ? 'Hide tools' : 'Tools'}
                </button>
                <button
                  type="button"
                  disabled={rediscover.isPending}
                  onClick={() => rediscover.mutate(server.id)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Rediscover
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => handleRemove(server)}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>

            {openServerId === server.id && (
              <div className="mt-4 border-t border-border pt-4">
                <ToolList serverId={server.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

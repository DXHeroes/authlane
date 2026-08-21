import {
  BeakerIcon,
  BoltIcon,
  CheckCircleIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  ShieldCheckIcon,
} from '@heroicons/react/16/solid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentProviderStatus } from '@/components/sandbox/SandboxAgentWorkspace';
import { SandboxAgentWorkspace } from '@/components/sandbox/SandboxAgentWorkspace';
import { api } from '@/lib/api';

type Risk = 'read' | 'write' | 'destructive';

interface SandboxTool {
  name: string;
  description: string;
  risk: Risk;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean };
}

interface SandboxService {
  serviceId: string;
  status: string;
  connected: boolean;
  toolAccessPolicy: 'read_only' | 'full';
  tools: SandboxTool[];
}

interface SandboxContext {
  externalUserId: string;
  services: SandboxService[];
  providers?: AgentProviderStatus[];
}

interface SandboxIdentity {
  externalUserId: string;
  connectedServices: number;
  lastUsedAt: string | null;
}

interface SandboxIdentities {
  identities: SandboxIdentity[];
  suggested: string;
}

/** Mirrors the server generator so a brand-new identity can be offered without a round trip. */
function generateExternalUserId(): string {
  return `sandbox_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

interface SandboxResult {
  status: 'succeeded' | 'failed' | 'approval_required';
  result?: unknown;
  error?: { code: string; message: string };
}

const inputClass =
  'w-full rounded-md bg-background px-3 py-2.5 text-base ring-1 ring-border focus-visible:outline-2 -outline-offset-1 focus-visible:outline-primary sm:py-2 sm:text-sm';

const secondaryButtonClass =
  'relative inline-flex h-9 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';

const primaryButtonClass =
  'relative inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';

function RiskBadge({ risk }: { risk: Risk }) {
  const label = risk === 'read' ? 'Read only' : 'Approval required';
  const color =
    risk === 'read'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : risk === 'destructive'
        ? 'bg-red-500/10 text-red-700 dark:text-red-300'
        : 'bg-amber-500/10 text-amber-800 dark:text-amber-300';
  return (
    <span className={`inline-flex rounded-full px-2 py-1 font-mono text-xs tracking-wide ${color}`}>
      {label}
    </span>
  );
}

export default function SandboxPage() {
  const [externalUserId, setExternalUserId] = useState('');
  const [identities, setIdentities] = useState<SandboxIdentity[]>([]);
  // Set the moment the operator touches the field, so a slow suggestion cannot overwrite them.
  const identityTouched = useRef(false);
  const [context, setContext] = useState<SandboxContext | null>(null);
  const [activeTab, setActiveTab] = useState<'tool' | 'agent'>('tool');
  const [serviceId, setServiceId] = useState('');
  const [toolName, setToolName] = useState('');
  const [argumentsText, setArgumentsText] = useState('{}');
  const [toolResult, setToolResult] = useState<SandboxResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedServices = useMemo(
    () => context?.services.filter((service) => service.connected) ?? [],
    [context]
  );
  const selectedService = connectedServices.find((service) => service.serviceId === serviceId);
  const selectedTool = selectedService?.tools.find((tool) => tool.name === toolName);

  const fetchContext = useCallback(async (normalizedExternalUserId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<SandboxContext>(
        `/sandbox?externalUserId=${encodeURIComponent(normalizedExternalUserId)}`
      );
      setContext(data);
      const firstService = data.services.find(
        (service) => service.connected && service.tools.length
      );
      setServiceId(firstService?.serviceId ?? '');
      setToolName(firstService?.tools[0]?.name ?? '');
      setToolResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load the sandbox user.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function loadContext(candidate?: string) {
    const normalizedExternalUserId = (candidate ?? externalUserId).trim();
    if (!normalizedExternalUserId.startsWith('sandbox_')) {
      setError('Use a dedicated external user ID that starts with sandbox_.');
      return;
    }
    await fetchContext(normalizedExternalUserId);
  }

  // Arrive ready: suggest the identity that already has connections, so the chat has tools on the
  // first message instead of asking the operator to remember an ID.
  useEffect(() => {
    let cancelled = false;
    api
      .get<SandboxIdentities>('/sandbox/identities')
      .then((data) => {
        if (cancelled || identityTouched.current) return;
        setIdentities(data.identities);
        setExternalUserId(data.suggested);
        if (data.identities.some((identity) => identity.externalUserId === data.suggested)) {
          void fetchContext(data.suggested);
        }
      })
      .catch(() => {
        if (cancelled || identityTouched.current) return;
        setExternalUserId(generateExternalUserId());
      });
    return () => {
      cancelled = true;
    };
  }, [fetchContext]);

  function selectService(value: string) {
    setServiceId(value);
    const service = connectedServices.find((candidate) => candidate.serviceId === value);
    setToolName(service?.tools[0]?.name ?? '');
    setToolResult(null);
  }

  async function runTool(approved: boolean) {
    if (!selectedTool) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(argumentsText);
    } catch {
      setError('Arguments must be valid JSON.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Arguments must be a JSON object.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.post<SandboxResult>('/sandbox/tool-runs', {
        externalUserId: context?.externalUserId,
        serviceId,
        toolName,
        arguments: parsed,
        approved,
      });
      setToolResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tool execution failed.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="isolate min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-foreground/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base text-muted-foreground sm:text-sm">
              <BeakerIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
              Production-like validation
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight">Sandbox</h1>
            <p className="max-w-[70ch] text-pretty text-base text-muted-foreground sm:text-sm">
              Validate one connected identity with the same SDK, credential lease, and local tool
              adapter your SaaS uses in production.
            </p>
          </div>
          {context && (
            <div className="flex shrink-0 items-center gap-2 text-base text-emerald-700 sm:text-sm dark:text-emerald-300">
              <CheckCircleIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
              {connectedServices.length} connected services
            </div>
          )}
        </header>

        <section className="rounded-lg bg-muted/60 p-4 ring-1 ring-foreground/5 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="size-4 shrink-0 fill-amber-600" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-medium">Use a dedicated test identity</h2>
              <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                Never point Sandbox at a real end user. Tool arguments and responses stay ephemeral,
                while Authlane records only execution metadata for auditing.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-b border-foreground/10 pb-6">
          {identities.length > 0 && (
            <label className="flex max-w-2xl flex-col gap-2 font-medium" htmlFor="sandbox-identity">
              Known sandbox identities
              <select
                id="sandbox-identity"
                name="identity"
                value={
                  identities.some((identity) => identity.externalUserId === externalUserId)
                    ? externalUserId
                    : ''
                }
                onChange={(event) => {
                  if (!event.target.value) return;
                  identityTouched.current = true;
                  setExternalUserId(event.target.value);
                  void loadContext(event.target.value);
                }}
                className={inputClass}
              >
                <option value="">Select an identity…</option>
                {identities.map((identity) => (
                  <option key={identity.externalUserId} value={identity.externalUserId}>
                    {identity.externalUserId} — {identity.connectedServices} connected{' '}
                    {identity.connectedServices === 1 ? 'service' : 'services'}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label htmlFor="sandbox-external-user" className="font-medium">
            External user ID
          </label>
          <div className="flex max-w-2xl flex-col gap-3 sm:flex-row">
            <input
              id="sandbox-external-user"
              name="externalUserId"
              type="text"
              value={externalUserId}
              onChange={(event) => {
                identityTouched.current = true;
                setExternalUserId(event.target.value);
              }}
              placeholder="sandbox_user_001"
              className={`${inputClass} min-w-0 flex-1`}
              aria-describedby="sandbox-external-user-help"
            />
            <button
              type="button"
              onClick={() => void loadContext()}
              disabled={isLoading || !externalUserId.trim()}
              className={context ? secondaryButtonClass : primaryButtonClass}
            >
              Load sandbox user
            </button>
            <button
              type="button"
              onClick={() => {
                identityTouched.current = true;
                setExternalUserId(generateExternalUserId());
                setContext(null);
                setError(null);
              }}
              disabled={isLoading}
              className={secondaryButtonClass}
            >
              New identity
            </button>
          </div>
          <p id="sandbox-external-user-help" className="text-sm text-muted-foreground">
            Dedicated test IDs must start with <code className="font-mono">sandbox_</code>. A new
            identity has nothing connected until you run it through hosted connect.
          </p>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-500/10 p-3 text-base text-red-700 sm:text-sm dark:text-red-300">
            <ExclamationTriangleIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {context && connectedServices.length === 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-4 ring-1 ring-amber-600/20">
            <ShieldCheckIcon className="size-4 shrink-0 fill-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-medium text-amber-950 dark:text-amber-100">
                Nothing is connected for this identity
              </h2>
              <p className="text-pretty text-base text-amber-900/80 sm:text-sm dark:text-amber-200/80">
                Create a connect session for{' '}
                <code className="font-mono">{context.externalUserId}</code> and connect a service
                first — until then the tool runner and the agent have nothing to call.{' '}
                <a className="underline" href="/docs/guides/sandbox">
                  How to prepare a Sandbox identity
                </a>
              </p>
            </div>
          </div>
        )}

        {context && (
          <section className="flex flex-col gap-6">
            <div className="overflow-x-auto border-b border-foreground/10">
              <div className="flex min-w-max gap-6" role="tablist" aria-label="Sandbox mode">
                {(
                  [
                    ['tool', 'Tool runner', CommandLineIcon],
                    ['agent', 'AI agent', BoltIcon],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium ${
                      activeTab === id
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4 shrink-0 fill-current" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'tool' ? (
              <div>
                <div className="grid gap-8 xl:grid-cols-[3fr_2fr]">
                  <div className="flex min-w-0 flex-col gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 font-medium" htmlFor="sandbox-service">
                        Service
                        <select
                          id="sandbox-service"
                          name="serviceId"
                          value={serviceId}
                          onChange={(event) => selectService(event.target.value)}
                          className={inputClass}
                        >
                          {connectedServices.map((service) => (
                            <option key={service.serviceId} value={service.serviceId}>
                              {service.serviceId}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 font-medium" htmlFor="sandbox-tool">
                        Tool
                        <select
                          id="sandbox-tool"
                          name="toolName"
                          value={toolName}
                          onChange={(event) => {
                            setToolName(event.target.value);
                            setToolResult(null);
                          }}
                          className={inputClass}
                        >
                          {selectedService?.tools.map((tool) => (
                            <option key={tool.name} value={tool.name}>
                              {tool.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {selectedTool && (
                      <div className="flex flex-col gap-2 border-y border-foreground/10 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="min-w-0 break-all font-mono font-medium">
                            {selectedTool.name}
                          </h2>
                          <RiskBadge risk={selectedTool.risk} />
                        </div>
                        <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                          {selectedTool.description}
                        </p>
                      </div>
                    )}

                    <label className="flex flex-col gap-2 font-medium" htmlFor="sandbox-arguments">
                      Arguments (JSON)
                      <textarea
                        id="sandbox-arguments"
                        name="arguments"
                        rows={10}
                        spellCheck={false}
                        value={argumentsText}
                        onChange={(event) => setArgumentsText(event.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </label>

                    {toolResult?.status === 'approval_required' ? (
                      <div className="flex flex-col gap-3 rounded-lg bg-amber-500/10 p-4 ring-1 ring-amber-600/20">
                        <div className="flex items-start gap-2">
                          <ShieldCheckIcon
                            className="size-4 shrink-0 fill-amber-700"
                            aria-hidden="true"
                          />
                          <p className="text-pretty text-base text-amber-900 sm:text-sm dark:text-amber-200">
                            This operation can change provider data. Review the arguments before
                            approving it.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => runTool(true)}
                          className={`${primaryButtonClass} self-start`}
                        >
                          Approve and run
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isLoading || !selectedTool}
                        onClick={() => runTool(false)}
                        className={`${primaryButtonClass} self-start gap-2 pl-2 pr-3`}
                      >
                        <PlayIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
                        Run tool
                      </button>
                    )}
                  </div>

                  <OutputPanel title="Tool output" value={toolResult} />
                </div>
              </div>
            ) : (
              <SandboxAgentWorkspace
                key={context.externalUserId}
                externalUserId={context.externalUserId}
                providers={context.providers}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function OutputPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <aside className="min-w-0 rounded-lg bg-neutral-950 p-4 text-neutral-100 ring-1 ring-black/10 dark:shadow-none">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <CommandLineIcon className="size-4 shrink-0 fill-neutral-400" aria-hidden="true" />
        <h2 className="font-mono text-sm font-medium">{title}</h2>
      </div>
      <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-all pt-4 font-mono text-sm text-neutral-300">
        {value ? JSON.stringify(value, null, 2) : 'Run a tool or agent to inspect its response.'}
      </pre>
    </aside>
  );
}

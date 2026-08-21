import {
  ArrowPathIcon,
  BoltIcon,
  ChevronDownIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
} from '@heroicons/react/16/solid';
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { api, DashboardApiError } from '@/lib/api';
import {
  type AgentProvider,
  type AgentResult,
  type AgentStreamEvent,
  agentThreadReducer,
  buildApprovalRun,
  buildUserRun,
  type ChatEntry,
  initialAgentThreadState,
  type PendingRun,
} from './agent-thread';
import { SandboxAgentInspector } from './SandboxAgentInspector';

const modelDefaults: Record<AgentProvider, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-opus-5',
  google: 'gemini-2.5-flash',
};

const providerLabels: Record<AgentProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

const THREAD_STREAM_EVENTS = new Set([
  'text-delta',
  'tool-call',
  'tool-result',
  'tool-error',
  'tool-denied',
]);

export interface AgentProviderStatus {
  id: AgentProvider;
  configured: boolean;
}

const inputClass =
  'w-full rounded-md bg-background px-3 py-2.5 text-base ring-1 ring-border focus-visible:outline-2 -outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground sm:py-2 sm:text-sm';

const secondaryButtonClass =
  'relative inline-flex h-9 items-center justify-center rounded-md bg-secondary px-3 text-base font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm';

const primaryButtonClass =
  'relative inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm';

function TouchTarget() {
  return (
    <span
      className="absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
      aria-hidden="true"
    />
  );
}

function InspectRunButton({ runId, onSelect }: { runId: string; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(runId)}
      className="relative inline-flex h-7 items-center gap-1 rounded-md px-2 text-base font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
    >
      <CommandLineIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
      Inspect run
      <TouchTarget />
    </button>
  );
}

function ApprovalEntry({
  entry,
  isSubmitting,
  onDecision,
  approveButtonRef,
}: {
  entry: Extract<ChatEntry, { kind: 'approval' }>;
  isSubmitting: boolean;
  onDecision: (approved: boolean) => void;
  approveButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const decided = entry.decision !== undefined;
  return (
    <div className="rounded-lg bg-amber-500/10 p-4 ring-1 ring-amber-600/20">
      <div className="flex items-start gap-2">
        <ShieldCheckIcon
          className="size-4 shrink-0 fill-amber-700 dark:fill-amber-300"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-amber-950 dark:text-amber-100">
            {decided
              ? entry.decision
                ? 'Actions approved'
                : 'Actions denied'
              : 'Approval required'}
          </h3>
          <p className="text-pretty text-base text-amber-900/80 sm:text-sm dark:text-amber-200/80">
            Review every provider-changing action before continuing the thread.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-amber-950/10 dark:divide-amber-100/10">
        {entry.requests.map((request) => (
          <li key={request.approvalId} className="flex flex-col gap-2 py-3 first:pt-4 last:pb-0">
            <p className="break-all font-mono text-base font-medium sm:text-sm">
              {request.toolCall.toolName}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-base text-amber-900/80 sm:text-sm dark:text-amber-200/80">
              {JSON.stringify(request.toolCall.input, null, 2)}
            </pre>
          </li>
        ))}
      </ul>

      {!decided && (
        <div className="flex flex-wrap gap-2 pt-4">
          <button
            ref={approveButtonRef}
            type="button"
            disabled={isSubmitting}
            onClick={() => onDecision(true)}
            className={primaryButtonClass}
          >
            Approve action
            <TouchTarget />
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onDecision(false)}
            className={secondaryButtonClass}
          >
            Deny action
            <TouchTarget />
          </button>
        </div>
      )}
    </div>
  );
}

function ToolEntry({ entry }: { entry: Extract<ChatEntry, { kind: 'tool' }> }) {
  const label = {
    running: 'Running',
    done: 'Result',
    error: 'Failed',
    denied: 'Denied',
  }[entry.state];
  const tone =
    entry.state === 'error'
      ? 'text-red-700 dark:text-red-300'
      : entry.state === 'done'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-muted-foreground';

  return (
    <div className="min-w-0 rounded-lg bg-muted/60 p-3 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-all font-mono text-base font-medium sm:text-sm">
          {entry.toolName}
        </p>
        <span className={`flex items-center gap-1.5 text-base sm:text-sm ${tone}`}>
          {entry.state === 'running' && (
            <BoltIcon className="size-4 shrink-0 animate-pulse fill-current" aria-hidden="true" />
          )}
          {label}
        </span>
      </div>
      <details className="pt-2">
        <summary className="cursor-pointer text-base text-muted-foreground sm:text-sm">
          Arguments and result
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all pt-2 font-mono text-base text-muted-foreground sm:text-sm">
          {JSON.stringify(entry.input, null, 2)}
        </pre>
        {entry.output !== undefined && (
          <pre className="overflow-x-auto whitespace-pre-wrap break-all pt-2 font-mono text-base text-foreground sm:text-sm">
            {typeof entry.output === 'string'
              ? entry.output
              : JSON.stringify(entry.output, null, 2)}
            {entry.truncated
              ? '\n\n[truncated for display — the model received the full result]'
              : ''}
          </pre>
        )}
      </details>
    </div>
  );
}

function ConversationEntry({
  entry,
  isSubmitting,
  onSelectRun,
  onRetry,
  onDecision,
  approveButtonRef,
}: {
  entry: ChatEntry;
  isSubmitting: boolean;
  onSelectRun: (id: string) => void;
  onRetry: (id: string) => void;
  onDecision: (approved: boolean) => void;
  approveButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  if (entry.kind === 'progress') {
    return (
      <div className="flex items-center gap-2 text-base text-muted-foreground sm:text-sm">
        <BoltIcon className="size-4 shrink-0 animate-pulse fill-current" aria-hidden="true" />
        Agent is working…
      </div>
    );
  }

  if (entry.kind === 'approval') {
    return (
      <ApprovalEntry
        entry={entry}
        isSubmitting={isSubmitting}
        onDecision={onDecision}
        approveButtonRef={approveButtonRef}
      />
    );
  }

  if (entry.kind === 'tool') {
    return <ToolEntry entry={entry} />;
  }

  if (entry.kind === 'error') {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-red-500/10 p-4 ring-1 ring-red-600/20">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon
            className="size-4 shrink-0 fill-red-700 dark:fill-red-300"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-red-950 dark:text-red-100">Agent run failed</h3>
            <p className="text-pretty text-base text-red-900/80 sm:text-sm dark:text-red-200/80">
              {entry.message}
            </p>
            {entry.hint && (
              <p className="text-pretty text-base text-red-900/70 sm:text-sm dark:text-red-200/70">
                {entry.hint}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onRetry(entry.runId)}
            className={`${secondaryButtonClass} gap-1.5 pl-2 pr-3`}
          >
            <ArrowPathIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
            Retry message
            <TouchTarget />
          </button>
          <InspectRunButton runId={entry.runId} onSelect={onSelectRun} />
        </div>
      </div>
    );
  }

  if (entry.kind === 'user') {
    return (
      <article className="flex justify-end" aria-label="You">
        <div className="flex max-w-[85%] flex-col gap-1.5 rounded-lg bg-primary p-3 text-primary-foreground">
          <p className="font-medium">You</p>
          <p className="whitespace-pre-wrap break-words text-pretty text-base sm:text-sm">
            {entry.text}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="flex min-w-0 flex-col gap-2" aria-label="Assistant">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="font-medium">Assistant</p>
        <InspectRunButton runId={entry.runId} onSelect={onSelectRun} />
      </div>
      <p className="whitespace-pre-wrap break-words text-pretty text-base text-foreground sm:text-sm">
        {entry.text}
      </p>
    </article>
  );
}

export function SandboxAgentWorkspace({
  externalUserId,
  providers = [],
}: {
  externalUserId: string;
  providers?: AgentProviderStatus[];
}) {
  const [state, dispatch] = useReducer(agentThreadReducer, initialAgentThreadState);
  // Starting on a provider with no server key would make the first message fail for a reason that
  // has nothing to do with the connector under test.
  const defaultProvider = providers.find((entry) => entry.configured)?.id ?? 'openai';
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider);
  const [model, setModel] = useState(modelDefaults[defaultProvider]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const configurationLocked = state.runs.length > 0;
  const isSubmitting = state.status === 'submitting';
  const canSend =
    state.draft.trim().length > 0 && !isSubmitting && state.pendingApprovals.length === 0;
  const selectedSnapshot = useMemo(
    () => state.runs.find((run) => run.id === state.selectedRunId) ?? null,
    [state.runs, state.selectedRunId]
  );

  useEffect(() => {
    if (state.entries.length > 0) {
      threadEndRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [state.entries.length]);

  useEffect(() => {
    if (state.status === 'approval_required') {
      approveButtonRef.current?.focus();
    } else if (state.status === 'idle' && state.runs.length > 0) {
      composerRef.current?.focus();
    }
  }, [state.status, state.runs.length]);

  /**
   * Streams the run and falls back to the request/response endpoint only when the transport itself
   * failed before the first event — a proxy that buffers or drops `text/event-stream` must not
   * take the chat down with it. A rejection the server explained is not retried.
   */
  async function streamRun(run: PendingRun): Promise<AgentResult> {
    let received = false;
    try {
      let result: AgentResult | null = null;
      for await (const frame of api.stream('/sandbox/agent-runs/stream', run.request)) {
        received = true;
        if (frame.event === 'done') {
          result = (frame.data as { result: AgentResult }).result;
          continue;
        }
        if (frame.event === 'error') {
          result = { status: 'failed', ...(frame.data as { error: AgentResult['error'] }) };
          continue;
        }
        // The approval card is rendered from the final payload, so only the entry-shaping events
        // are folded into the thread here.
        if (THREAD_STREAM_EVENTS.has(frame.event)) {
          dispatch({
            type: 'run_stream_event',
            runId: run.id,
            event: frame.data as AgentStreamEvent,
          });
        }
      }
      if (result) return result;
      throw new Error('The agent stream ended without a result.');
    } catch (cause) {
      if (received || cause instanceof DashboardApiError) throw cause;
      return api.post<AgentResult>('/sandbox/agent-runs', run.request);
    }
  }

  async function executeRun(run: PendingRun) {
    dispatch({ type: 'run_started', run });
    try {
      const response = await streamRun(run);
      dispatch({ type: 'run_succeeded', runId: run.id, response });
    } catch (cause) {
      const error =
        cause instanceof DashboardApiError
          ? {
              message: cause.message,
              code: cause.code,
              hint: cause.hint,
              docUrl: cause.docUrl,
            }
          : { message: cause instanceof Error ? cause.message : 'Agent execution failed.' };
      dispatch({ type: 'run_failed', runId: run.id, error });
    }
  }

  async function sendMessage() {
    if (!canSend) return;
    await executeRun(
      buildUserRun(state, {
        runId: crypto.randomUUID(),
        externalUserId,
        provider,
        model,
        text: state.draft,
      })
    );
  }

  async function decideApproval(approved: boolean) {
    if (state.pendingApprovals.length === 0 || isSubmitting) return;
    await executeRun(
      buildApprovalRun(state, {
        runId: crypto.randomUUID(),
        externalUserId,
        provider,
        model,
        approved,
      })
    );
  }

  async function retryRun(runId: string) {
    const snapshot = state.runs.find((run) => run.id === runId);
    if (!snapshot || isSubmitting) return;
    await executeRun({ id: snapshot.id, request: snapshot.request, isRetry: true });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void sendMessage();
  }

  function resetChat() {
    dispatch({ type: 'reset' });
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  return (
    <div>
      <section className="flex flex-col gap-6" aria-labelledby="sandbox-ai-chat-title">
        <div className="flex flex-col gap-4 border-b border-foreground/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="sandbox-ai-chat-title" className="text-balance text-xl font-semibold">
                AI chat
              </h2>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-base font-medium text-emerald-700 sm:text-sm dark:text-emerald-300">
                Ephemeral session
              </span>
            </div>
            <p className="max-w-[70ch] text-pretty text-base text-muted-foreground sm:text-sm">
              Thread is cleared on reload. Prompts, responses, and tool data are never persisted.
            </p>
          </div>
          <button
            type="button"
            onClick={resetChat}
            disabled={state.runs.length === 0 && state.draft.length === 0}
            className={`${secondaryButtonClass} self-start gap-1.5 pl-2 pr-3 md:self-auto`}
          >
            <ArrowPathIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
            New chat
            <TouchTarget />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label
            className="flex min-w-0 flex-col gap-2 font-medium"
            htmlFor="sandbox-agent-provider"
          >
            Provider
            <span className="inline-grid min-w-0 grid-cols-[1fr_2rem]">
              <select
                id="sandbox-agent-provider"
                name="provider"
                value={provider}
                disabled={configurationLocked}
                onChange={(event) => {
                  const next = event.target.value as AgentProvider;
                  setProvider(next);
                  setModel(modelDefaults[next]);
                }}
                className={`${inputClass} col-span-full row-start-1 appearance-none pr-8`}
              >
                {(['openai', 'anthropic', 'google'] as const).map((id) => {
                  const configured =
                    providers.find((entry) => entry.id === id)?.configured !== false;
                  return (
                    <option key={id} value={id}>
                      {providerLabels[id]}
                      {configured ? '' : ' — no server key'}
                    </option>
                  );
                })}
              </select>
              <ChevronDownIcon
                className="pointer-events-none col-start-2 row-start-1 size-4 place-self-center fill-muted-foreground"
                aria-hidden="true"
              />
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-2 font-medium" htmlFor="sandbox-agent-model">
            Model
            <input
              id="sandbox-agent-model"
              name="model"
              type="text"
              value={model}
              disabled={configurationLocked}
              onChange={(event) => setModel(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[3fr_2fr] xl:items-start">
          <div className="min-w-0 overflow-hidden rounded-lg bg-background ring-1 ring-foreground/10">
            <div
              className="flex min-h-[28rem] max-h-[38rem] flex-col gap-5 overflow-y-auto p-4 sm:p-5"
              role="log"
              aria-label="Conversation"
              aria-live="polite"
              aria-busy={isSubmitting}
            >
              {state.entries.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
                  <BoltIcon className="size-4 shrink-0 fill-muted-foreground" aria-hidden="true" />
                  <h3 className="font-medium">Start with a real connector question</h3>
                  <p className="max-w-[50ch] text-pretty text-base text-muted-foreground sm:text-sm">
                    The agent receives only tools available to this Sandbox identity.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-5">
                  {state.entries.map((entry) => (
                    <li key={entry.id} className="min-w-0">
                      <ConversationEntry
                        entry={entry}
                        isSubmitting={isSubmitting}
                        onSelectRun={(runId) => dispatch({ type: 'run_selected', runId })}
                        onRetry={(runId) => void retryRun(runId)}
                        onDecision={(approved) => void decideApproval(approved)}
                        approveButtonRef={approveButtonRef}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <div ref={threadEndRef} aria-hidden="true" />
            </div>

            <form
              className="flex flex-col gap-3 border-t border-foreground/10 bg-muted/30 p-3 sm:p-4"
              onSubmit={submit}
            >
              <label className="font-medium" htmlFor="sandbox-agent-message">
                Message
              </label>
              <textarea
                ref={composerRef}
                id="sandbox-agent-message"
                name="message"
                rows={3}
                value={state.draft}
                disabled={isSubmitting}
                placeholder="Ask the agent to use a connected service…"
                onChange={(event) => dispatch({ type: 'draft_changed', draft: event.target.value })}
                onKeyDown={handleComposerKeyDown}
                className={`${inputClass} resize-y`}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                  {state.pendingApprovals.length > 0
                    ? 'Resolve the pending approval before continuing.'
                    : 'Enter to send. Shift+Enter for a new line.'}
                </p>
                <button
                  type="submit"
                  disabled={!canSend}
                  className={`${primaryButtonClass} shrink-0 gap-1.5 self-start pl-2 pr-3 sm:self-auto`}
                >
                  <PaperAirplaneIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
                  Send message
                  <TouchTarget />
                </button>
              </div>
            </form>
          </div>

          <SandboxAgentInspector snapshot={selectedSnapshot} />
        </div>
      </section>
    </div>
  );
}

export type AgentProvider = 'openai' | 'anthropic' | 'google';
export type ThreadStatus = 'idle' | 'submitting' | 'approval_required' | 'failed';

export interface ApprovalRequest {
  approvalId: string;
  toolCall: { toolName: string; input: unknown };
}

export interface AgentResult {
  status: 'succeeded' | 'failed' | 'approval_required';
  text?: string;
  finishReason?: string;
  responseMessages?: unknown[];
  approvalRequests?: ApprovalRequest[];
  usage?: unknown;
  error?: { code: string; message: string };
}

export interface AgentRunRequest {
  externalUserId: string;
  provider: AgentProvider;
  model: string;
  messages: unknown[];
}

export interface RunError {
  message: string;
  code?: string;
  hint?: string;
  docUrl?: string;
}

export interface AgentRunSnapshot {
  id: string;
  request: AgentRunRequest;
  response?: AgentResult;
  error?: RunError;
  toolActivity: unknown[];
}

export type ChatEntry =
  | { id: string; kind: 'user'; text: string; runId: string }
  | { id: string; kind: 'assistant'; text: string; runId: string }
  | { id: string; kind: 'progress'; runId: string }
  | {
      id: string;
      kind: 'approval';
      requests: ApprovalRequest[];
      runId: string;
      decision?: boolean;
    }
  | { id: string; kind: 'error'; message: string; runId: string };

export interface PendingRun {
  id: string;
  request: AgentRunRequest;
  userText?: string;
  approvalDecision?: boolean;
  isRetry?: boolean;
}

export interface AgentThreadState {
  modelMessages: unknown[];
  entries: ChatEntry[];
  runs: AgentRunSnapshot[];
  selectedRunId: string | null;
  pendingApprovals: ApprovalRequest[];
  status: ThreadStatus;
  draft: string;
}

export type AgentThreadAction =
  | { type: 'draft_changed'; draft: string }
  | { type: 'run_started'; run: PendingRun }
  | { type: 'run_succeeded'; runId: string; response: AgentResult }
  | { type: 'run_failed'; runId: string; error: RunError }
  | { type: 'run_selected'; runId: string }
  | { type: 'reset' };

export const initialAgentThreadState: AgentThreadState = {
  modelMessages: [],
  entries: [],
  runs: [],
  selectedRunId: null,
  pendingApprovals: [],
  status: 'idle',
  draft: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractToolActivity(response: AgentResult): unknown[] {
  const approvals = (response.approvalRequests ?? []).map((request) => ({
    type: 'tool-approval-request',
    ...request,
  }));
  const messageParts = (response.responseMessages ?? []).flatMap((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) return [];
    return message.content.filter(
      (part) =>
        isRecord(part) &&
        typeof part.type === 'string' &&
        part.type.startsWith('tool-') &&
        part.type !== 'tool-approval-request'
    );
  });
  return [...approvals, ...messageParts];
}

export function buildUserRun(
  state: AgentThreadState,
  input: {
    runId: string;
    externalUserId: string;
    provider: AgentProvider;
    model: string;
    text: string;
  }
): PendingRun {
  const text = input.text.trim();
  return {
    id: input.runId,
    userText: text,
    request: {
      externalUserId: input.externalUserId,
      provider: input.provider,
      model: input.model,
      messages: [...state.modelMessages, { role: 'user', content: text }],
    },
  };
}

export function buildApprovalRun(
  state: AgentThreadState,
  input: {
    runId: string;
    externalUserId: string;
    provider: AgentProvider;
    model: string;
    approved: boolean;
  }
): PendingRun {
  const reason = input.approved
    ? 'Operator approved this Sandbox action.'
    : 'Operator denied this Sandbox action.';
  return {
    id: input.runId,
    approvalDecision: input.approved,
    request: {
      externalUserId: input.externalUserId,
      provider: input.provider,
      model: input.model,
      messages: [
        ...state.modelMessages,
        {
          role: 'tool',
          content: state.pendingApprovals.map(({ approvalId }) => ({
            type: 'tool-approval-response',
            approvalId,
            approved: input.approved,
            reason,
          })),
        },
      ],
    },
  };
}

function startRun(state: AgentThreadState, run: PendingRun): AgentThreadState {
  const entries = state.entries
    .filter(
      (entry) => !(entry.runId === run.id && (entry.kind === 'progress' || entry.kind === 'error'))
    )
    .map((entry) =>
      run.approvalDecision !== undefined &&
      entry.kind === 'approval' &&
      entry.decision === undefined
        ? { ...entry, decision: run.approvalDecision }
        : entry
    );

  if (run.userText && !run.isRetry) {
    entries.push({ id: `${run.id}_user`, kind: 'user', text: run.userText, runId: run.id });
  }
  entries.push({ id: `${run.id}_progress`, kind: 'progress', runId: run.id });

  const snapshot: AgentRunSnapshot = {
    id: run.id,
    request: run.request,
    toolActivity: [],
  };
  return {
    ...state,
    draft: run.userText ? '' : state.draft,
    entries,
    runs: [...state.runs.filter((candidate) => candidate.id !== run.id), snapshot],
    selectedRunId: run.id,
    pendingApprovals: run.approvalDecision === undefined ? state.pendingApprovals : [],
    status: 'submitting',
  };
}

function failRun(state: AgentThreadState, runId: string, error: RunError): AgentThreadState {
  return {
    ...state,
    status: 'failed',
    entries: [
      ...state.entries.filter((entry) => !(entry.runId === runId && entry.kind === 'progress')),
      { id: `${runId}_error`, kind: 'error', message: error.message, runId },
    ],
    runs: state.runs.map((run) => (run.id === runId ? { ...run, error } : run)),
  };
}

function completeRun(
  state: AgentThreadState,
  runId: string,
  response: AgentResult
): AgentThreadState {
  const snapshot = state.runs.find((run) => run.id === runId);
  if (!snapshot) return state;

  const pendingApprovals = response.approvalRequests ?? [];
  const entries: ChatEntry[] = state.entries.filter(
    (entry) => !(entry.runId === runId && entry.kind === 'progress')
  );

  if (response.status === 'failed') {
    entries.push({
      id: `${runId}_error`,
      kind: 'error',
      message: response.error?.message ?? 'Agent execution failed.',
      runId,
    });
  } else if (response.text?.trim()) {
    entries.push({
      id: `${runId}_assistant`,
      kind: 'assistant',
      text: response.text,
      runId,
    });
  }

  if (pendingApprovals.length > 0) {
    entries.push({
      id: `${runId}_approval`,
      kind: 'approval',
      requests: pendingApprovals,
      runId,
    });
  }

  return {
    ...state,
    modelMessages: [...snapshot.request.messages, ...(response.responseMessages ?? [])],
    entries,
    runs: state.runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            response,
            error: undefined,
            toolActivity: extractToolActivity(response),
          }
        : run
    ),
    pendingApprovals,
    status:
      response.status === 'failed'
        ? 'failed'
        : pendingApprovals.length > 0
          ? 'approval_required'
          : 'idle',
  };
}

export function agentThreadReducer(
  state: AgentThreadState,
  action: AgentThreadAction
): AgentThreadState {
  if (action.type === 'reset') return initialAgentThreadState;
  if (action.type === 'draft_changed') return { ...state, draft: action.draft };
  if (action.type === 'run_selected') return { ...state, selectedRunId: action.runId };
  if (action.type === 'run_started') return startRun(state, action.run);
  if (action.type === 'run_failed') return failRun(state, action.runId, action.error);
  return completeRun(state, action.runId, action.response);
}

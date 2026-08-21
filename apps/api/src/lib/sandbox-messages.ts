import { type ModelMessage, modelMessageSchema } from 'ai';

const MAX_MESSAGES = 80;
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_SERIALIZED_BYTES = 1024 * 1024;

export type SandboxHistoryErrorCode = 'SANDBOX_HISTORY_TOO_LARGE' | 'SANDBOX_HISTORY_INVALID';

export type SandboxMessagesResult =
  | { ok: true; messages: ModelMessage[] }
  | { ok: false; code: SandboxHistoryErrorCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A text or reasoning part the provider filled with nothing. Anthropic and Google both emit one
 * next to a tool call, so rejecting the history over it would end the thread on the second turn.
 * The part carries no meaning for the model either, which is why it is dropped rather than kept.
 */
function isEmptyTextPart(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === 'text' || value.type === 'reasoning') &&
    typeof value.text === 'string' &&
    value.text.trim().length === 0
  );
}

function hasOverlongText(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasOverlongText);
  if (!isRecord(value)) return false;
  if (
    (value.type === 'text' || value.type === 'reasoning') &&
    (typeof value.text !== 'string' || value.text.length > MAX_TEXT_CHARACTERS)
  ) {
    return true;
  }
  return Object.values(value).some(hasOverlongText);
}

function withoutEmptyTextParts(message: ModelMessage): ModelMessage | null {
  if (!Array.isArray(message.content)) return message;
  const content = message.content.filter((part) => !isEmptyTextPart(part));
  if (content.length === 0) return null;
  return { ...message, content } as ModelMessage;
}

function hasValidApprovalSequence(messages: ModelMessage[]): boolean {
  const pending = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!isRecord(part)) continue;
      if (part.type === 'tool-approval-request' && typeof part.approvalId === 'string') {
        if (pending.has(part.approvalId)) return false;
        pending.add(part.approvalId);
      }
      if (part.type === 'tool-approval-response' && typeof part.approvalId === 'string') {
        if (!pending.delete(part.approvalId)) return false;
      }
    }
  }
  return true;
}

export function parseSandboxMessages(value: unknown): SandboxMessagesResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: 'SANDBOX_HISTORY_INVALID' };
  }
  if (value.length > MAX_MESSAGES) {
    return { ok: false, code: 'SANDBOX_HISTORY_TOO_LARGE' };
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SERIALIZED_BYTES) {
    return { ok: false, code: 'SANDBOX_HISTORY_TOO_LARGE' };
  }

  const messages: ModelMessage[] = [];
  for (const candidate of value) {
    const parsed = modelMessageSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.role === 'system' || hasOverlongText(parsed.data)) {
      return { ok: false, code: 'SANDBOX_HISTORY_INVALID' };
    }
    if (
      typeof parsed.data.content === 'string' &&
      (parsed.data.content.trim().length === 0 || parsed.data.content.length > MAX_TEXT_CHARACTERS)
    ) {
      return { ok: false, code: 'SANDBOX_HISTORY_INVALID' };
    }
    const message = withoutEmptyTextParts(parsed.data);
    if (message) messages.push(message);
  }

  if (messages.length === 0) return { ok: false, code: 'SANDBOX_HISTORY_INVALID' };
  return hasValidApprovalSequence(messages)
    ? { ok: true, messages }
    : { ok: false, code: 'SANDBOX_HISTORY_INVALID' };
}

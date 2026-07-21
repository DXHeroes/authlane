import { type ModelMessage, modelMessageSchema } from 'ai';

const MAX_MESSAGES = 40;
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_SERIALIZED_BYTES = 200 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasInvalidText(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasInvalidText);
  if (!isRecord(value)) return false;
  if (
    (value.type === 'text' || value.type === 'reasoning') &&
    (typeof value.text !== 'string' ||
      value.text.trim().length === 0 ||
      value.text.length > MAX_TEXT_CHARACTERS)
  ) {
    return true;
  }
  return Object.values(value).some(hasInvalidText);
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

export function parseSandboxMessages(value: unknown): ModelMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SERIALIZED_BYTES)
    return null;

  const messages: ModelMessage[] = [];
  for (const candidate of value) {
    const parsed = modelMessageSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.role === 'system' || hasInvalidText(parsed.data)) {
      return null;
    }
    if (
      typeof parsed.data.content === 'string' &&
      (parsed.data.content.trim().length === 0 || parsed.data.content.length > MAX_TEXT_CHARACTERS)
    ) {
      return null;
    }
    messages.push(parsed.data);
  }
  return hasValidApprovalSequence(messages) ? messages : null;
}

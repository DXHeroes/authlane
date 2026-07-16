import type { ParentMessage, WidgetMessage } from '../types';

export class PostMessageBridge {
  private targetOrigin: string | null;

  constructor(targetOrigin?: string) {
    this.targetOrigin = targetOrigin ? this.validateOrigin(targetOrigin) : null;
  }

  setTargetOrigin(targetOrigin: string): void {
    this.targetOrigin = this.validateOrigin(targetOrigin);
  }

  sendToParent(message: WidgetMessage): void {
    if (this.targetOrigin && window.parent && window.parent !== window) {
      window.parent.postMessage(message, this.targetOrigin);
    }
  }

  onMessage(callback: (message: ParentMessage) => void): () => void {
    const handler = (event: MessageEvent) => {
      if (
        event.source === window.parent &&
        event.origin === this.targetOrigin &&
        this.isValidMessage(event.data)
      ) {
        callback(event.data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  private validateOrigin(value: string): string {
    const url = new URL(value);
    const localDevelopment =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !localDevelopment)
    ) {
      throw new Error('Widget parentOrigin must be an exact HTTPS origin');
    }
    return url.origin;
  }

  private isValidMessage(data: unknown): data is ParentMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg.type === 'string' && msg.type.startsWith('parent:');
  }
}

export const postMessageBridge = new PostMessageBridge();

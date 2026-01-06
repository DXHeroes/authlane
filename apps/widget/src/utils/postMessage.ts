import type { ParentMessage, WidgetMessage } from '../types';

export class PostMessageBridge {
  private targetOrigin: string;

  constructor(targetOrigin = '*') {
    this.targetOrigin = targetOrigin;
  }

  sendToParent(message: WidgetMessage): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, this.targetOrigin);
    }
  }

  onMessage(callback: (message: ParentMessage) => void): () => void {
    const handler = (event: MessageEvent) => {
      if (this.isValidMessage(event.data)) {
        callback(event.data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  private isValidMessage(data: unknown): data is ParentMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg.type === 'string' && msg.type.startsWith('parent:');
  }
}

export const postMessageBridge = new PostMessageBridge();

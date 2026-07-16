import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMessageBridge } from '../src/utils/postMessage';

describe('PostMessageBridge', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects wildcard and non-TLS parent origins', () => {
    const bridge = new PostMessageBridge();

    expect(() => bridge.setTargetOrigin('*')).toThrow();
    expect(() => bridge.setTargetOrigin('http://tenant.example')).toThrow();
    expect(() => bridge.setTargetOrigin('https://tenant.example/path')).toThrow();
  });

  it('sends only to the exact configured parent origin', () => {
    const bridge = new PostMessageBridge('https://tenant.example');
    const postMessage = vi.fn();
    const parentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage },
    });

    try {
      bridge.sendToParent({ type: 'widget:ready' });

      expect(postMessage).toHaveBeenCalledWith({ type: 'widget:ready' }, 'https://tenant.example');
    } finally {
      if (parentDescriptor) Object.defineProperty(window, 'parent', parentDescriptor);
    }
  });
});

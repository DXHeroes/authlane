import { afterEach, describe, expect, it, vi } from 'vitest';
import { hardenReadOnlyApiReference, observeReadOnlyApiReference } from './api-reference-readonly';

function renderScalarClient() {
  document.body.innerHTML = `
    <main class="authlane-api-reference">
      <button class="security-requirement-badge">AuthenticationRequired</button>
    </main>
    <section class="scalar-app-layout scalar-client" aria-label="API Client">
      <input aria-label="Token" />
      <button aria-label="Show Password">Show Password</button>
      <button>Send Request</button>
      <a href="https://api.example.com">Open request</a>
    </section>`;
}

function expectStructurallyReadOnly() {
  const client = document.querySelector<HTMLElement>(
    '.scalar-app-layout.scalar-client[aria-label="API Client"]'
  );
  const badge = document.querySelector<HTMLButtonElement>('.security-requirement-badge');
  const controls = document.querySelectorAll<HTMLElement>(
    '.scalar-app-layout.scalar-client button, .scalar-app-layout.scalar-client input, .scalar-app-layout.scalar-client a'
  );

  expect(client?.hasAttribute('inert')).toBe(true);
  expect(client?.getAttribute('aria-hidden')).toBe('true');
  expect(badge?.disabled).toBe(true);
  expect(badge?.tabIndex).toBe(-1);
  for (const control of controls) {
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(control.tabIndex).toBe(-1);
    if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
      expect(control.disabled).toBe(true);
    }
  }
}

describe('read-only Scalar hardening', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('makes the hydrated client and authentication controls structurally inert', () => {
    renderScalarClient();

    hardenReadOnlyApiReference(document);

    expectStructurallyReadOnly();
  });

  it('hardens controls mounted or re-enabled after initial hydration', async () => {
    const stopObserving = observeReadOnlyApiReference(document.body);
    renderScalarClient();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expectStructurallyReadOnly();

    const sendButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Send Request'
    );
    expect(sendButton).toBeDefined();
    if (!sendButton) return;
    sendButton.disabled = false;
    sendButton.removeAttribute('aria-disabled');
    sendButton.tabIndex = 0;

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expectStructurallyReadOnly();
    stopObserving();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeLandingInteractions } from './landing-interactions.js';

describe('dependency-free landing interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('operates the mobile menu and every accessible code-tab interaction', () => {
    document.body.innerHTML = `
      <button class="mobile-navigation__toggle" aria-controls="mobile-navigation" aria-expanded="false" aria-label="Open navigation menu">Menu</button>
      <nav id="mobile-navigation" hidden><a href="#product">Product</a></nav>
      <div class="code-tabs">
        <button role="tab" aria-controls="sdk-panel" aria-selected="true" tabindex="0">SDK</button>
        <button role="tab" aria-controls="api-panel" aria-selected="false" tabindex="-1">API</button>
        <button role="tab" aria-controls="mcp-panel" aria-selected="false" tabindex="-1">MCP</button>
        <div id="sdk-panel" role="tabpanel">SDK sample</div>
        <div id="api-panel" role="tabpanel" hidden>API sample</div>
        <div id="mcp-panel" role="tabpanel" hidden>MCP sample</div>
      </div>`;
    initializeLandingInteractions();

    const menuButton = document.querySelector<HTMLButtonElement>('.mobile-navigation__toggle');
    const navigation = document.querySelector<HTMLElement>('#mobile-navigation');
    expect(menuButton).not.toBeNull();
    expect(navigation).not.toBeNull();
    if (!menuButton || !navigation) return;

    menuButton.click();
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(menuButton.getAttribute('aria-label')).toBe('Close navigation menu');
    expect(navigation.hidden).toBe(false);
    navigation.querySelector<HTMLAnchorElement>('a')?.click();
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(menuButton.getAttribute('aria-label')).toBe('Open navigation menu');
    expect(navigation.hidden).toBe(true);

    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    const press = (tabIndex: number, key: string) => {
      tabs[tabIndex].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };
    const expectSelected = (index: number) => {
      tabs.forEach((tab, tabIndex) => {
        expect(tab.getAttribute('aria-selected')).toBe(String(tabIndex === index));
        expect(tab.getAttribute('tabindex')).toBe(tabIndex === index ? '0' : '-1');
        expect(panels[tabIndex].hidden).toBe(tabIndex !== index);
      });
    };

    tabs[1].click();
    expectSelected(1);
    press(1, 'ArrowRight');
    expectSelected(2);
    press(2, 'ArrowRight');
    expectSelected(0);
    press(0, 'ArrowLeft');
    expectSelected(2);
    press(2, 'Home');
    expectSelected(0);
    press(0, 'End');
    expectSelected(2);
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('initializes docs tabs from a readable all-panels-visible fallback', () => {
    document.body.innerHTML = `
      <div class="docs-code-group" data-tab-group>
        <button role="tab" aria-controls="typescript-panel" aria-selected="true" tabindex="0">TypeScript</button>
        <button role="tab" aria-controls="python-panel" aria-selected="false" tabindex="-1">Python</button>
        <div id="typescript-panel" role="tabpanel">TypeScript sample</div>
        <div id="python-panel" role="tabpanel">Python sample</div>
      </div>`;

    const panels = [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels.every((panel) => !panel.hidden)).toBe(true);

    initializeLandingInteractions();

    expect(panels[0].hidden).toBe(false);
    expect(panels[1].hidden).toBe(true);
  });

  it('copies exact code and announces success', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.body.innerHTML = `
      <div class="docs-code-shell" data-code-source="const value = '&lt;safe&gt;';">
        <button data-copy-code aria-label="Copy TypeScript code">Copy</button>
      </div>`;
    initializeLandingInteractions();
    document.querySelector<HTMLButtonElement>('[data-copy-code]')?.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("const value = '<safe>';");
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copied');

    vi.advanceTimersByTime(1_500);
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copy');
  });

  it('announces clipboard failure without throwing', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.body.innerHTML = `
      <div class="docs-code-shell" data-code-source="const ok = false;">
        <button data-copy-code aria-label="Copy TypeScript code">Copy</button>
      </div>`;
    initializeLandingInteractions();
    document.querySelector<HTMLButtonElement>('[data-copy-code]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copy failed');
    vi.advanceTimersByTime(1_500);
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copy');
  });
});

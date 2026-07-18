import { describe, expect, it } from 'vitest';
import { initializeLandingInteractions } from './landing-interactions.js';

describe('dependency-free landing interactions', () => {
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
});

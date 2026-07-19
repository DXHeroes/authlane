import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeLandingInteractions, rankDocsSearch } from './landing-interactions.js';

function deferredClipboardWrite() {
  let resolve = () => {};
  let reject = (_reason?: unknown) => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const searchEntries = [
  {
    slug: 'guides/connect-user',
    title: 'Connect a user',
    description: '',
    headingId: '',
    heading: '',
    text: 'Create a connect session.',
    keywords: ['externalUserId'],
  },
  {
    slug: 'sdk/typescript',
    title: 'TypeScript SDK',
    description: '',
    headingId: 'user-scoped-resources',
    heading: 'User-scoped resources',
    text: 'Bind an external user.',
    keywords: ['typescript'],
  },
];

function renderDocsSearchMarkup() {
  document.body.innerHTML = `
    <button type="button" data-docs-search-open aria-keyshortcuts="Meta+K Control+K">
      Search documentation <kbd>⌘K</kbd>
    </button>
    <dialog id="docs-search" aria-labelledby="docs-search-title">
      <h2 id="docs-search-title">Search documentation</h2>
      <input type="search" name="docs-search" data-docs-search-input autocomplete="off" />
      <ol data-docs-search-results aria-live="polite"></ol>
      <button type="button" data-docs-search-close>Close</button>
    </dialog>`;
}

async function settleSearchRequest() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('documentation search ranking', () => {
  it('ranks exact title and heading matches above body matches', () => {
    expect(rankDocsSearch(searchEntries, 'connect a user')[0].slug).toBe('guides/connect-user');
    expect(rankDocsSearch(searchEntries, 'user-scoped resources')[0].headingId).toBe(
      'user-scoped-resources'
    );
  });

  it('matches SDK names, service IDs, and error codes case-insensitively', () => {
    expect(rankDocsSearch(searchEntries, 'EXTERNALUSERID')[0].slug).toBe('guides/connect-user');
    expect(rankDocsSearch(searchEntries, '   ')).toEqual([]);
  });

  it('deduplicates identical targets and resolves score ties by navigation order', () => {
    const entries = [
      { ...searchEntries[1], text: 'Shared phrase.' },
      { ...searchEntries[0], text: 'Shared phrase.' },
      { ...searchEntries[1], text: 'Shared phrase repeated.' },
    ];

    expect(rankDocsSearch(entries, 'shared phrase').map(({ slug }) => slug)).toEqual([
      'sdk/typescript',
      'guides/connect-user',
    ]);
  });

  it('honors the result limit', () => {
    expect(rankDocsSearch(searchEntries, 'user', 1)).toHaveLength(1);
  });
});

describe('dependency-free landing interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it.each([
    { modifier: 'Command', metaKey: true },
    { modifier: 'Control', ctrlKey: true },
  ])('opens search with $modifier+K and lazily fetches the local index', async (keys) => {
    const fetchSearchIndex = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(searchEntries),
    });
    vi.stubGlobal('fetch', fetchSearchIndex);
    renderDocsSearchMarkup();
    initializeLandingInteractions();

    const trigger = document.querySelector<HTMLButtonElement>('[data-docs-search-open]');
    const dialog = document.querySelector<HTMLDialogElement>('#docs-search');
    const input = document.querySelector<HTMLInputElement>('[data-docs-search-input]');
    expect(trigger).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(input).not.toBeNull();
    if (!trigger || !dialog || !input) return;

    trigger.focus();
    expect(fetchSearchIndex).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, ...keys }));
    await settleSearchRequest();

    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(fetchSearchIndex).toHaveBeenCalledTimes(1);
    expect(fetchSearchIndex).toHaveBeenCalledWith('/docs/search-index.json', {
      credentials: 'same-origin',
    });

    document.querySelector<HTMLButtonElement>('[data-docs-search-close]')?.click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await settleSearchRequest();
    expect(fetchSearchIndex).toHaveBeenCalledTimes(1);
  });

  it('traverses result links, closes on Escape, and restores focus', async () => {
    const traversalEntries = searchEntries.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords, 'shared'],
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(traversalEntries),
      })
    );
    renderDocsSearchMarkup();
    initializeLandingInteractions();

    const trigger = document.querySelector<HTMLButtonElement>('[data-docs-search-open]');
    const dialog = document.querySelector<HTMLDialogElement>('#docs-search');
    const input = document.querySelector<HTMLInputElement>('[data-docs-search-input]');
    trigger?.focus();
    trigger?.click();
    await settleSearchRequest();
    if (!trigger || !dialog || !input) return;

    input.value = 'shared';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-docs-search-result]')];
    expect(links).toHaveLength(2);
    expect(links[1].getAttribute('href')).toBe('/docs/sdk/typescript#user-scoped-resources');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(links[0]);
    expect(links[0].getAttribute('data-active')).toBe('true');
    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(links[1]);
    links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(links[0]);

    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('renders the exact navigation fallback when the local index cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unavailable')));
    renderDocsSearchMarkup();
    initializeLandingInteractions();

    document.querySelector<HTMLButtonElement>('[data-docs-search-open]')?.click();
    await settleSearchRequest();

    expect(document.querySelector('[data-docs-search-results]')?.textContent).toBe(
      'Search is temporarily unavailable. Browse the documentation navigation instead.'
    );
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
        <span data-copy-status aria-live="polite" aria-atomic="true"></span>
        <button data-copy-code aria-label="Copy TypeScript code">Copy</button>
      </div>`;
    initializeLandingInteractions();
    document.querySelector<HTMLButtonElement>('[data-copy-code]')?.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("const value = '<safe>';");
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copied');
    expect(document.querySelector('[data-copy-status]')?.textContent).toBe('Copied');
    expect(document.querySelector('[data-copy-code]')?.getAttribute('aria-label')).toBe(
      'Copy TypeScript code'
    );

    vi.advanceTimersByTime(1_500);
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copy');
    expect(document.querySelector('[data-copy-status]')?.textContent).toBe('');
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
        <span data-copy-status aria-live="polite" aria-atomic="true"></span>
        <button data-copy-code aria-label="Copy TypeScript code">Copy</button>
      </div>`;
    initializeLandingInteractions();
    document.querySelector<HTMLButtonElement>('[data-copy-code]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copy failed');
    expect(document.querySelector('[data-copy-status]')?.textContent).toBe('Copy failed');
    vi.advanceTimersByTime(1_500);
    expect(document.querySelector('[data-copy-code]')?.textContent).toBe('Copy');
    expect(document.querySelector('[data-copy-status]')?.textContent).toBe('');
  });

  it('ignores stale clipboard completions from rapid copy attempts', async () => {
    vi.useFakeTimers();
    const firstWrite = deferredClipboardWrite();
    const secondWrite = deferredClipboardWrite();
    const writeText = vi
      .fn()
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.body.innerHTML = `
      <div class="docs-code-shell" data-code-source="const newest = true;">
        <span data-copy-status aria-live="polite" aria-atomic="true"></span>
        <button data-copy-code aria-label="Copy TypeScript code">Copy</button>
      </div>`;
    initializeLandingInteractions();
    const control = document.querySelector<HTMLButtonElement>('[data-copy-code]');
    const status = document.querySelector<HTMLElement>('[data-copy-status]');

    control?.click();
    control?.click();
    secondWrite.resolve();
    await Promise.resolve();
    expect(control?.textContent).toBe('Copied');
    expect(status?.textContent).toBe('Copied');

    firstWrite.reject(new Error('Stale failure'));
    await Promise.resolve();
    await Promise.resolve();
    expect(control?.textContent).toBe('Copied');
    expect(status?.textContent).toBe('Copied');
  });

  it('clears the prior reset timer when a newer copy attempt starts', async () => {
    vi.useFakeTimers();
    const firstWrite = deferredClipboardWrite();
    const secondWrite = deferredClipboardWrite();
    const writeText = vi
      .fn()
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.body.innerHTML = `
      <div class="docs-code-shell" data-code-source="const newest = true;">
        <span data-copy-status aria-live="polite" aria-atomic="true"></span>
        <button data-copy-code aria-label="Copy TypeScript code">Copy</button>
      </div>`;
    initializeLandingInteractions();
    const control = document.querySelector<HTMLButtonElement>('[data-copy-code]');
    const status = document.querySelector<HTMLElement>('[data-copy-status]');

    control?.click();
    firstWrite.resolve();
    await Promise.resolve();
    expect(status?.textContent).toBe('Copied');

    vi.advanceTimersByTime(1_000);
    control?.click();
    secondWrite.resolve();
    await Promise.resolve();
    expect(status?.textContent).toBe('Copied');

    vi.advanceTimersByTime(500);
    expect(control?.textContent).toBe('Copied');
    expect(status?.textContent).toBe('Copied');
    vi.advanceTimersByTime(999);
    expect(status?.textContent).toBe('Copied');
    vi.advanceTimersByTime(1);
    expect(control?.textContent).toBe('Copy');
    expect(status?.textContent).toBe('');
  });
});

/**
 * @typedef {object} DocsSearchEntry
 * @property {string} slug
 * @property {string} title
 * @property {string} description
 * @property {string | null} headingId
 * @property {string | null} heading
 * @property {string} text
 * @property {string[]} keywords
 */

/** @param {unknown} value */
function normalizeSearchValue(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim();
}

/**
 * Rank documentation search results without requiring a client bundle.
 *
 * @param {DocsSearchEntry[]} entries
 * @param {string} query
 * @param {number} [limit]
 * @returns {DocsSearchEntry[]}
 */
export function rankDocsSearch(entries, query, limit = 8) {
  const normalizedQuery = normalizeSearchValue(query);
  const normalizedLimit = Math.max(0, Math.trunc(limit));
  if (!normalizedQuery || normalizedLimit === 0) return [];

  const queryTokens = normalizedQuery.split(/\s+/u);
  const seenTargets = new Set();
  /**
   * @type {{
   *   entry: DocsSearchEntry;
   *   navigationIndex: number;
   *   normalizedTitle: string;
   *   score: number;
   * }[]}
   */
  const scoredEntries = [];

  entries.forEach((entry, navigationIndex) => {
    const target = `${entry.slug}\0${entry.headingId ?? ''}`;
    if (seenTargets.has(target)) return;
    seenTargets.add(target);

    const title = normalizeSearchValue(entry.title);
    const heading = normalizeSearchValue(entry.heading);
    const body = normalizeSearchValue(`${entry.description} ${entry.text}`);
    const keywords = entry.keywords.map(normalizeSearchValue);
    const titleAndHeadingTokens = new Set(`${title} ${heading}`.trim().split(/\s+/u));
    const bodyTokens = new Set(body.split(/\s+/u));
    let score = 0;

    if (title === normalizedQuery) score += 100;
    else if (title.startsWith(normalizedQuery)) score += 70;
    if (heading === normalizedQuery) score += 60;
    if (keywords.includes(normalizedQuery)) score += 50;

    queryTokens.forEach((token) => {
      if (titleAndHeadingTokens.has(token)) score += 20;
      if (bodyTokens.has(token)) score += 5;
      if (keywords.includes(token) && token !== normalizedQuery) score += 50;
    });

    if (score > 0) {
      scoredEntries.push({ entry, navigationIndex, normalizedTitle: title, score });
    }
  });

  return scoredEntries
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.navigationIndex !== right.navigationIndex) {
        return left.navigationIndex - right.navigationIndex;
      }
      if (left.normalizedTitle < right.normalizedTitle) return -1;
      if (left.normalizedTitle > right.normalizedTitle) return 1;
      return 0;
    })
    .slice(0, normalizedLimit)
    .map(({ entry }) => entry);
}

/** @param {Document | HTMLElement} root */
export function initializeLandingInteractions(root = document) {
  const navigationToggle = root.querySelector('.mobile-navigation__toggle');
  const navigation = root.querySelector('#mobile-navigation');

  /** @param {boolean} isOpen */
  const setNavigationOpen = (isOpen) => {
    if (!(navigationToggle instanceof HTMLButtonElement) || !(navigation instanceof HTMLElement)) {
      return;
    }
    navigationToggle.setAttribute('aria-expanded', String(isOpen));
    navigationToggle.setAttribute(
      'aria-label',
      isOpen ? 'Close navigation menu' : 'Open navigation menu'
    );
    navigation.hidden = !isOpen;
  };

  navigationToggle?.addEventListener('click', () => {
    setNavigationOpen(navigationToggle.getAttribute('aria-expanded') !== 'true');
  });
  navigation?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setNavigationOpen(false));
  });

  const searchDialog = root.querySelector('#docs-search');
  const searchInput = searchDialog?.querySelector('[data-docs-search-input]');
  const searchResults = searchDialog?.querySelector('[data-docs-search-results]');
  const searchClose = searchDialog?.querySelector('[data-docs-search-close]');

  if (
    searchDialog instanceof HTMLDialogElement &&
    searchInput instanceof HTMLInputElement &&
    searchResults instanceof HTMLOListElement
  ) {
    const ownerDocument = searchDialog.ownerDocument;
    /** @type {DocsSearchEntry[] | undefined} */
    let loadedSearchEntries;
    /** @type {Promise<DocsSearchEntry[]> | undefined} */
    let searchEntriesPromise;
    /** @type {HTMLElement | null} */
    let returnFocusTo = null;
    let activeResultIndex = -1;

    const getResultLinks = () =>
      /** @type {HTMLAnchorElement[]} */ ([
        ...searchResults.querySelectorAll('[data-docs-search-result]'),
      ]);

    /**
     * @param {number} index
     * @param {boolean} moveFocus
     */
    const setActiveResult = (index, moveFocus = false) => {
      const links = getResultLinks();
      if (links.length === 0) {
        activeResultIndex = -1;
        return;
      }

      activeResultIndex = ((index % links.length) + links.length) % links.length;
      links.forEach((link, linkIndex) => {
        if (linkIndex === activeResultIndex) link.setAttribute('data-active', 'true');
        else link.removeAttribute('data-active');
      });
      if (moveFocus) links[activeResultIndex]?.focus();
    };

    /** @param {string} message */
    const renderSearchStatus = (message) => {
      activeResultIndex = -1;
      const status = ownerDocument.createElement('li');
      status.className = 'docs-search__status';
      status.textContent = message;
      searchResults.replaceChildren(status);
    };

    /** @param {DocsSearchEntry[]} entries */
    const renderSearchResults = (entries) => {
      activeResultIndex = -1;
      const query = searchInput.value;
      const rankedEntries = rankDocsSearch(entries, query);
      const fragment = ownerDocument.createDocumentFragment();

      rankedEntries.forEach((entry) => {
        const item = ownerDocument.createElement('li');
        const link = ownerDocument.createElement('a');
        const title = ownerDocument.createElement('div');
        const context = ownerDocument.createElement('div');
        const target = `/docs/${entry.slug}${entry.headingId ? `#${entry.headingId}` : ''}`;

        link.className = 'docs-search__result';
        link.setAttribute('data-docs-search-result', '');
        link.setAttribute('href', target);
        title.className = 'docs-search__result-title';
        title.textContent = entry.title;
        context.className = 'docs-search__result-context';
        context.textContent = entry.heading || entry.description;
        link.append(title);
        if (context.textContent) link.append(context);
        item.append(link);
        fragment.append(item);
      });

      if (rankedEntries.length === 0 && query.trim()) {
        renderSearchStatus('No documentation results found.');
        return;
      }
      searchResults.replaceChildren(fragment);
    };

    const loadSearchEntries = () => {
      if (!searchEntriesPromise) {
        searchEntriesPromise = fetch('/docs/search-index.json', {
          credentials: 'same-origin',
        }).then(async (response) => {
          if (!response.ok) throw new Error('Documentation search index request failed.');
          const entries = await response.json();
          if (!Array.isArray(entries)) {
            throw new Error('Documentation search index response is invalid.');
          }
          return /** @type {DocsSearchEntry[]} */ (entries);
        });
      }
      return searchEntriesPromise;
    };

    const restoreSearchFocus = () => {
      returnFocusTo?.focus();
      returnFocusTo = null;
    };

    const closeSearch = () => {
      if (searchDialog.open) searchDialog.close();
      restoreSearchFocus();
    };

    /** @param {HTMLElement | null} opener */
    const openSearch = (opener) => {
      if (!searchDialog.open) {
        returnFocusTo = opener;
        searchDialog.showModal();
      }
      searchInput.focus();
      searchInput.select();

      if (loadedSearchEntries) {
        renderSearchResults(loadedSearchEntries);
        return;
      }

      renderSearchStatus('Loading documentation search…');
      void loadSearchEntries()
        .then((entries) => {
          loadedSearchEntries = entries;
          renderSearchResults(entries);
        })
        .catch(() => {
          renderSearchStatus(
            'Search is temporarily unavailable. Browse the documentation navigation instead.'
          );
        });
    };

    root.querySelectorAll('[data-docs-search-open]').forEach((control) => {
      if (!(control instanceof HTMLButtonElement)) return;
      control.addEventListener('click', () => openSearch(control));
    });

    searchClose?.addEventListener('click', closeSearch);
    searchDialog.addEventListener('close', restoreSearchFocus);
    searchDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSearch();
    });
    searchInput.addEventListener('input', () => {
      if (loadedSearchEntries) renderSearchResults(loadedSearchEntries);
    });
    searchDialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const links = getResultLinks();
      if (links.length === 0) return;
      event.preventDefault();
      const focusedResultIndex =
        ownerDocument.activeElement instanceof HTMLAnchorElement
          ? links.indexOf(ownerDocument.activeElement)
          : -1;
      const nextIndex =
        focusedResultIndex === -1
          ? event.key === 'ArrowDown'
            ? 0
            : links.length - 1
          : focusedResultIndex + (event.key === 'ArrowDown' ? 1 : -1);
      setActiveResult(nextIndex, true);
    });
    ownerDocument.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey) || event.altKey) {
        return;
      }
      event.preventDefault();
      openSearch(
        ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null
      );
    });
  }

  root.querySelectorAll('.code-tabs, [data-tab-group]').forEach((tabGroup) => {
    const tabs = /** @type {HTMLButtonElement[]} */ ([
      ...tabGroup.querySelectorAll('[role="tab"]'),
    ]);
    const panels = /** @type {HTMLElement[]} */ ([
      ...tabGroup.querySelectorAll('[role="tabpanel"]'),
    ]);

    /**
     * @param {number} index
     * @param {boolean} moveFocus
     */
    const selectTab = (index, moveFocus = false) => {
      const selectedTab = tabs[index];
      if (!(selectedTab instanceof HTMLButtonElement)) return;

      tabs.forEach((tab, tabIndex) => {
        const isSelected = tabIndex === index;
        tab.setAttribute('aria-selected', String(isSelected));
        tab.setAttribute('tabindex', isSelected ? '0' : '-1');
      });
      panels.forEach((panel) => {
        panel.hidden = panel.id !== selectedTab.getAttribute('aria-controls');
      });
      if (moveFocus) selectedTab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(index));
      tab.addEventListener('keydown', (event) => {
        let nextIndex;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === undefined) return;

        event.preventDefault();
        selectTab(nextIndex, true);
      });
    });

    const selectedIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    selectTab(selectedIndex >= 0 ? selectedIndex : 0);
  });

  root.querySelectorAll('[data-copy-code]').forEach((control) => {
    if (!(control instanceof HTMLButtonElement)) return;
    const originalLabel = control.textContent ?? 'Copy';
    const sourceContainer = control.closest('[data-code-source]');
    const status = sourceContainer?.querySelector('[data-copy-status]');
    let attempt = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let resetTimer;

    control.addEventListener('click', async () => {
      const currentAttempt = ++attempt;
      if (resetTimer !== undefined) {
        clearTimeout(resetTimer);
        resetTimer = undefined;
      }
      control.textContent = originalLabel;
      if (status instanceof HTMLElement) status.textContent = '';

      const source = sourceContainer?.getAttribute('data-code-source');
      let feedback;

      try {
        if (source === undefined || source === null || !navigator.clipboard?.writeText) {
          throw new Error('Clipboard access is unavailable.');
        }
        await navigator.clipboard.writeText(source);
        feedback = 'Copied';
      } catch {
        feedback = 'Copy failed';
      }

      if (currentAttempt !== attempt) return;
      control.textContent = feedback;
      if (status instanceof HTMLElement) status.textContent = feedback;

      resetTimer = setTimeout(() => {
        if (currentAttempt !== attempt) return;
        control.textContent = originalLabel;
        if (status instanceof HTMLElement) status.textContent = '';
        resetTimer = undefined;
      }, 1_500);
    });
  });
}

initializeLandingInteractions();

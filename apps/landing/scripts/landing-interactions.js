/** @param {ParentNode} root */
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

    control.addEventListener('click', async () => {
      const sourceContainer = control.closest('[data-code-source]');
      const source = sourceContainer?.getAttribute('data-code-source');

      try {
        if (source === undefined || source === null || !navigator.clipboard?.writeText) {
          throw new Error('Clipboard access is unavailable.');
        }
        await navigator.clipboard.writeText(source);
        control.textContent = 'Copied';
      } catch {
        control.textContent = 'Copy failed';
      }

      setTimeout(() => {
        control.textContent = originalLabel;
      }, 1_500);
    });
  });
}

initializeLandingInteractions();

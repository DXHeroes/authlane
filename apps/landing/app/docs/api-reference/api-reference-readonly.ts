const blockedScalarUiSelector = [
  '.scalar-app-layout.scalar-client[aria-label="API Client"]',
  '.authlane-api-reference .security-requirement-badge',
].join(', ');

const interactiveSelector = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[tabindex]',
].join(', ');

function setAttribute(element: HTMLElement, name: string, value: string) {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

function makeInert(element: HTMLElement) {
  if (!element.hasAttribute('inert')) {
    element.setAttribute('inert', '');
  }
  setAttribute(element, 'aria-hidden', 'true');
  setAttribute(element, 'aria-disabled', 'true');
  setAttribute(element, 'tabindex', '-1');

  if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
    if (!element.hasAttribute('disabled')) {
      element.setAttribute('disabled', '');
    }
  }
}

/**
 * Scalar keeps its API client mounted even when every launch point is hidden.
 * Make that subtree and its auth controls structurally non-interactive as a
 * defense in depth for Authlane's public, read-only API reference.
 */
export function hardenReadOnlyApiReference(root: ParentNode) {
  for (const blockedUi of root.querySelectorAll<HTMLElement>(blockedScalarUiSelector)) {
    makeInert(blockedUi);
    for (const control of blockedUi.querySelectorAll<HTMLElement>(interactiveSelector)) {
      makeInert(control);
    }
  }
}

export function observeReadOnlyApiReference(mutationRoot: HTMLElement) {
  const documentRoot = mutationRoot.ownerDocument;
  const harden = () => hardenReadOnlyApiReference(documentRoot);
  const observer = new MutationObserver(harden);

  harden();
  observer.observe(mutationRoot, {
    attributes: true,
    attributeFilter: ['aria-disabled', 'aria-hidden', 'disabled', 'inert', 'tabindex'],
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}

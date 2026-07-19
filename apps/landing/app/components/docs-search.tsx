/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */

export function DocsSearch() {
  return (
    <div className="docs-search">
      <button
        className="docs-search__trigger"
        type="button"
        data-docs-search-open
        aria-keyshortcuts="Meta+K Control+K"
      >
        <span>Search documentation</span>
        <kbd>⌘K</kbd>
      </button>
      <dialog id="docs-search" className="docs-search__dialog" aria-labelledby="docs-search-title">
        <div className="docs-search__panel">
          <h2 id="docs-search-title">Search documentation</h2>
          <input
            id="docs-search-input"
            className="docs-search__input"
            type="search"
            name="docs-search"
            data-docs-search-input
            autoComplete="off"
            aria-label="Search documentation"
            placeholder="Search guides, SDKs, services, and errors"
          />
          <ol
            className="docs-search__results"
            data-docs-search-results
            aria-live="polite"
            aria-label="Search results"
            role="list"
          />
          <button className="docs-search__close" type="button" data-docs-search-close>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}

import { Children, isValidElement, type ReactElement, type ReactNode, useId } from 'react';
import { highlightCode, normalizeLanguage } from '../lib/highlight-code';

const languageLabels: Record<string, string> = {
  bash: 'Bash',
  http: 'HTTP',
  javascript: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  python: 'Python',
  text: 'Text',
  tsx: 'TSX',
  typescript: 'TypeScript',
  yaml: 'YAML',
};

function getLanguageLabel(language: string): string {
  return languageLabels[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

export function DocsCodeBlock({ language, source }: { language: string; source: string }) {
  const normalizedLanguage = normalizeLanguage(language);
  const languageLabel = getLanguageLabel(normalizedLanguage);

  return (
    <div className="docs-code-shell" data-code-source={source}>
      <div className="docs-code-toolbar">
        <span className="mono docs-code-language">{languageLabel}</span>
        <span className="docs-code-status" data-copy-status aria-live="polite" aria-atomic="true" />
        <button
          className="docs-code-copy"
          type="button"
          data-copy-code
          aria-label={`Copy ${languageLabel} code`}
        >
          Copy
        </button>
      </div>
      <pre className={`docs-code language-${normalizedLanguage}`}>
        <code
          className={`language-${normalizedLanguage}`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism escapes repository-owned MDX during static generation.
          dangerouslySetInnerHTML={{ __html: highlightCode(source, normalizedLanguage) }}
        />
      </pre>
    </div>
  );
}

export type CodeGroupItemProps = {
  label: string;
  children?: ReactNode;
};

export function CodeGroupItem({ children }: CodeGroupItemProps) {
  return <>{children}</>;
}

function validatedCodeGroupItems(children: ReactNode): ReactElement<CodeGroupItemProps>[] {
  const items = Children.toArray(children);
  if (items.length === 0) {
    throw new Error('CodeGroup requires at least one CodeGroupItem.');
  }

  return items.map((item) => {
    if (!isValidElement<CodeGroupItemProps>(item) || item.type !== CodeGroupItem) {
      throw new Error('CodeGroup children must be CodeGroupItem elements.');
    }
    if (typeof item.props.label !== 'string' || !item.props.label.trim()) {
      throw new Error('CodeGroupItem requires a non-empty label.');
    }
    if (Children.count(item.props.children) === 0) {
      throw new Error(`CodeGroupItem "${item.props.label}" requires a code child.`);
    }
    return item;
  });
}

export function CodeGroup({ children }: { children?: ReactNode }) {
  const items = validatedCodeGroupItems(children);

  const groupId = useId();

  return (
    <div className="code-tabs docs-code-group" data-tab-group>
      <div className="code-tabs__list" role="tablist" aria-label="Code examples">
        {items.map((item, index) => {
          const tabId = `${groupId}-tab-${index}`;
          const panelId = `${groupId}-panel-${index}`;
          return (
            <button
              key={tabId}
              id={tabId}
              className="code-tabs__tab"
              type="button"
              role="tab"
              aria-controls={panelId}
              aria-selected={index === 0}
              tabIndex={index === 0 ? 0 : -1}
            >
              {item.props.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => {
        const tabId = `${groupId}-tab-${index}`;
        const panelId = `${groupId}-panel-${index}`;
        return (
          <div
            key={panelId}
            id={panelId}
            className="code-tabs__panel"
            role="tabpanel"
            aria-labelledby={tabId}
          >
            {item.props.children}
          </div>
        );
      })}
    </div>
  );
}

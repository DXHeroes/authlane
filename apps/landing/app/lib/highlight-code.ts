import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-yaml';

const aliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  tsx: 'tsx',
  yml: 'yaml',
};

export function normalizeLanguage(value?: string): string {
  const language = value?.replace(/^language-/, '').toLowerCase() || 'text';
  return aliases[language] ?? language;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function highlightCode(code: string, language?: string): string {
  const normalized = normalizeLanguage(language);
  const grammar = Prism.languages[normalized];
  return grammar ? Prism.highlight(code, grammar, normalized) : escapeHtml(code);
}

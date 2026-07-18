import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlight-code';

describe('build-time Prism highlighting', () => {
  it.each([
    ['typescript', 'const value: string = "ok";'],
    ['python', 'from authlane import Authlane'],
    ['yaml', 'openapi: 3.1.0'],
    ['http', 'GET /api/v1/catalog/services HTTP/1.1'],
  ])('highlights %s snippets', (language, source) => {
    expect(highlightCode(source, language)).toContain('class="token');
  });

  it('escapes unsupported diagrams without pretending to highlight them', () => {
    expect(highlightCode('A --> <Provider>', 'mermaid')).toBe('A --&gt; &lt;Provider&gt;');
  });
});

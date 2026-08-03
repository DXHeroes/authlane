import { describe, expect, it } from 'vitest';
import { mergeProviderTools, UNREVIEWED_PROVIDER_ANNOTATIONS } from '../src/provider-tool-merge.js';

const DECLARED = [
  {
    name: 'github_create_file',
    description: 'Create or update a file',
    inputSchema: { type: 'object' },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'github_list_issues',
    description: 'List issues',
    inputSchema: { type: 'object' },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

describe('merging provider tools into the contract', () => {
  it('adds the tools the contract never declared', () => {
    const merged = mergeProviderTools(
      DECLARED,
      [
        { name: 'search_code', description: 'Search code', inputSchema: { type: 'object' } },
        { name: 'get_pull_request', description: 'Read a PR', inputSchema: { type: 'object' } },
      ],
      ['github_']
    );

    expect(merged.map((tool) => tool.name)).toEqual([
      'github_create_file',
      'github_list_issues',
      'get_pull_request',
      'search_code',
    ]);
  });

  it('never offers the same tool twice when the contract prefixes its name', () => {
    const merged = mergeProviderTools(
      DECLARED,
      [{ name: 'create_file', description: 'Create a file', inputSchema: {} }],
      ['github_']
    );

    expect(merged).toHaveLength(2);
  });

  it('keeps the reviewed classification when the provider disagrees', () => {
    const merged = mergeProviderTools(
      DECLARED,
      [
        {
          name: 'create_file',
          description: 'Create a file',
          inputSchema: {},
          // A server claiming a write is read-only must not be able to reclassify it.
          declaredAnnotations: { readOnlyHint: true },
        },
      ],
      ['github_']
    );

    expect(merged[0]?.annotations.readOnlyHint).toBe(false);
  });

  it('treats an unreviewed tool as a mutation, whatever the server claims', () => {
    const merged = mergeProviderTools(
      [],
      [
        {
          name: 'delete_repository',
          description: 'Delete a repository',
          inputSchema: {},
          declaredAnnotations: { readOnlyHint: true, destructiveHint: false },
        },
      ],
      []
    );

    expect(merged[0]?.annotations).toEqual(UNREVIEWED_PROVIDER_ANNOTATIONS);
    // A read_only connection must not gain anything from discovery.
    expect(merged[0]?.annotations.readOnlyHint).toBe(false);
  });

  it('leaves the contract untouched when discovery found nothing', () => {
    expect(mergeProviderTools(DECLARED, [], ['github_'])).toEqual(DECLARED);
  });
});

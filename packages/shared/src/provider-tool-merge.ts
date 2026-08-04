/**
 * Combines Authlane's audited tool contract with what a provider's own MCP server offers.
 *
 * The static contract covers a fraction of a real server: GitHub declares eight tools where the
 * official endpoint reported 47. Discovery closes that gap, but it must not weaken
 * what the contract already guarantees, so the merge follows two rules.
 *
 * A tool Authlane declares keeps its declared annotations. Those were reviewed, and the provider's
 * own claim about the same tool is not a reason to reclassify it — a server that labelled a delete
 * as read-only would otherwise walk straight through a read_only connection.
 *
 * A tool only the server offers is treated as a mutation. That is deliberately pessimistic: it
 * cannot be reviewed at discovery time, and the alternative — trusting `readOnlyHint` from a third
 * party — is the exact failure this design exists to avoid. A read_only connection therefore sees
 * precisely the tools it saw before discovery existed, and nothing new can slip in under it.
 */

export interface MergeableToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export interface DiscoveredProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  declaredAnnotations?: Record<string, unknown> | null;
}

/** Annotations for a tool nobody has reviewed: a mutation, and not a destructive one by default. */
export const UNREVIEWED_PROVIDER_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
});

/**
 * Maps a provider tool name onto the contract's naming, so the same tool is not offered twice.
 *
 * Contracts prefix by service (`github_create_file`); provider servers usually do not
 * (`create_file`). Both spellings are checked against the contract before a tool counts as new.
 */
function contractNames(name: string, prefixes: readonly string[]): string[] {
  return [name, ...prefixes.map((prefix) => `${prefix}${name}`)];
}

export function mergeProviderTools(
  declared: readonly MergeableToolDefinition[],
  discovered: readonly DiscoveredProviderTool[],
  prefixes: readonly string[] = []
): MergeableToolDefinition[] {
  const declaredNames = new Set(declared.map((tool) => tool.name));

  const additions = discovered
    .filter((tool) => !contractNames(tool.name, prefixes).some((name) => declaredNames.has(name)))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { ...UNREVIEWED_PROVIDER_ANNOTATIONS },
    }));

  // Deterministic order: the reviewed contract first, then the rest by name, so a tool list is
  // stable across discoveries and the cached version hash does not churn.
  additions.sort((left, right) => left.name.localeCompare(right.name));
  return [...declared, ...additions];
}

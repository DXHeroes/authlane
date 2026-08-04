import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import { createProviderMcpOnlyTools } from '@authlane/shared';

/**
 * GitHub runs its own MCP server, and it is the only path Authlane uses.
 *
 * The official endpoint offers far more than the eight tools Authlane once implemented by hand — the
 * first discovery in production reported 47 — so keeping local handlers meant shipping a small,
 * separately maintained subset of somebody else's product. These declarations stay because they carry
 * reviewed annotations, which is what a read_only connection filters on; only the execution moved.
 */
export const tools = createProviderMcpOnlyTools(publicToolDefinitionsByService.github);

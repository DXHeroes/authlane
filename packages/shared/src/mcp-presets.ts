/**
 * Remote MCP servers Authlane has verified, offered to a workspace owner as a catalogue.
 *
 * A preset is only a prefilled registration: the id here never becomes a service id, nothing is
 * seeded into the `services` table, and the server still goes through the same discovery, host
 * checks and per-tool risk review as one a tenant types in by hand. The value is that nobody has to
 * find the URL, and that every entry was answered by a live server rather than copied from a blog.
 *
 * Every entry below was probed on the date in `verifiedAt`: an unauthenticated `initialize` and
 * `tools/list` were sent, and the server answered 401 with an RFC 9728 `resource_metadata` pointer.
 * That combination is what makes dynamic client registration possible, and therefore what makes an
 * entry cost one row instead of an OAuth application registered by hand.
 *
 * A vendor that publishes its authorization server beside its MCP host — Attio at `app.attio.com`,
 * Vercel at `api.vercel.com`, Figma at `api.figma.com`, monday at `auth.monday.com` — is registered
 * and connected like any other. Those endpoints are trusted because the server named that issuer
 * through a pointer served from its own host and the issuer then declared itself, not because of
 * any host relationship between the two. `packages/shared/src/mcp-discovery.ts` states that rule
 * once and `apps/api/tests/unit/mcp-discovery-run.test.ts` pins it.
 *
 * Also absent: one error-monitoring vendor whose integration and SDK were removed from Authlane in
 * `00ad2c4`, and whose reintroduction `scripts/removed-service-contract.test.ts` forbids by name. Its
 * MCP server verified fine; relaxing that decision is not this change's to make.
 *
 * Deliberately absent: servers that need no authorization at all (Firecrawl, Hugging Face, DeepWiki,
 * Context7 all answer `tools/list` on an open endpoint). Authlane exists to give each end user their
 * own credential; a server that authorizes nobody has nothing for it to broker, and a tenant can
 * point a client straight at it.
 */

export interface McpServerPreset {
  /** Stable key for the catalogue UI. Never a service id — those are pinned to the built-in list. */
  key: string;
  name: string;
  serverUrl: string;
  authType: 'oauth2' | 'api_key';
  category: McpPresetCategory;
  docsUrl: string;
  /** ISO date the endpoint was last confirmed to answer. Shown so a stale entry is visible. */
  verifiedAt: string;
}

/*
 * There is deliberately no `dynamicRegistration` flag here.
 *
 * There used to be, and 24 of these 44 entries disagreed with the live servers — in both
 * directions, so it was not even conservatively wrong: Webflow was labelled as not self-registering
 * while it self-registers perfectly. The flag gated nothing; its only reader was a sentence on the
 * dashboard card, which therefore told workspace owners the opposite of the truth for more than
 * half the catalogue. Correcting 24 literals by hand would have bought a year before the same
 * drift, because nothing keeps a hand-maintained boolean beside a URL honest.
 *
 * The dashboard now reads whether the stored metadata carries a `registration_endpoint`, which is
 * the server's own answer, recorded at discovery and refreshed by every sweep.
 */

export type McpPresetCategory =
  | 'productivity'
  | 'engineering'
  | 'crm'
  | 'design'
  | 'finance'
  | 'infrastructure'
  | 'observability'
  | 'security';

const VERIFIED = '2026-08-04';

function preset(
  key: string,
  name: string,
  serverUrl: string,
  category: McpPresetCategory,
  docsUrl: string,
  options: { authType?: 'oauth2' | 'api_key' } = {}
): McpServerPreset {
  return {
    key,
    name,
    serverUrl,
    authType: options.authType ?? 'oauth2',
    category,
    docsUrl,
    verifiedAt: VERIFIED,
  };
}

export const MCP_SERVER_PRESETS: readonly McpServerPreset[] = Object.freeze([
  // Productivity and project tracking
  preset(
    'linear',
    'Linear',
    'https://mcp.linear.app/mcp',
    'productivity',
    'https://linear.app/docs/mcp'
  ),
  preset(
    'asana',
    'Asana',
    'https://mcp.asana.com/v2/mcp',
    'productivity',
    'https://developers.asana.com/docs/mcp-server'
  ),
  preset(
    'notion',
    'Notion',
    'https://mcp.notion.com/mcp',
    'productivity',
    'https://developers.notion.com/guides/mcp/get-started-with-mcp'
  ),
  preset(
    'monday',
    'monday.com',
    'https://mcp.monday.com/sse',
    'productivity',
    'https://developer.monday.com/apps/docs/mondayapi-mcp'
  ),
  preset(
    'clickup',
    'ClickUp',
    'https://mcp.clickup.com/mcp',
    'productivity',
    'https://clickup.com/api'
  ),
  preset(
    'atlassian',
    'Atlassian (Jira & Confluence)',
    'https://mcp.atlassian.com/v1/mcp/authv2',
    'productivity',
    'https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/'
  ),
  preset(
    'slack',
    'Slack',
    'https://mcp.slack.com/mcp',
    'productivity',
    'https://docs.slack.dev/ai/slack-mcp-server/'
  ),
  preset(
    'fireflies',
    'Fireflies',
    'https://api.fireflies.ai/mcp',
    'productivity',
    'https://docs.fireflies.ai'
  ),

  // CRM and revenue
  preset(
    'attio',
    'Attio',
    'https://mcp.attio.com/mcp',
    'crm',
    'https://docs.attio.com/mcp/overview'
  ),
  preset(
    'hubspot',
    'HubSpot',
    'https://mcp.hubspot.com',
    'crm',
    'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server'
  ),
  preset('close', 'Close', 'https://mcp.close.com/mcp', 'crm', 'https://developer.close.com'),
  preset(
    'airtable',
    'Airtable',
    'https://mcp.airtable.com/mcp',
    'crm',
    'https://support.airtable.com/v1/docs/using-the-airtable-mcp-server'
  ),

  // Engineering
  preset(
    'gitlab',
    'GitLab',
    'https://gitlab.com/api/v4/mcp',
    'engineering',
    'https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/'
  ),
  preset(
    'semgrep',
    'Semgrep',
    'https://mcp.semgrep.ai/mcp',
    'security',
    'https://semgrep.dev/docs/'
  ),

  // Design
  preset(
    'figma',
    'Figma',
    'https://mcp.figma.com/mcp',
    'design',
    'https://help.figma.com/hc/en-us/articles/32132100833559'
  ),
  preset('miro', 'Miro', 'https://mcp.miro.com/v1/mcp', 'design', 'https://developers.miro.com'),
  preset(
    'canva',
    'Canva',
    'https://mcp.canva.com/mcp',
    'design',
    'https://www.canva.dev/docs/apps/mcp-server/'
  ),
  preset(
    'webflow',
    'Webflow',
    'https://mcp.webflow.com/sse',
    'design',
    'https://developers.webflow.com/data/docs/ai-tools'
  ),
  preset('wix', 'Wix', 'https://mcp.wix.com/sse', 'design', 'https://dev.wix.com/docs/'),

  // Finance
  preset('stripe', 'Stripe', 'https://mcp.stripe.com', 'finance', 'https://docs.stripe.com/mcp'),
  preset(
    'paypal',
    'PayPal',
    'https://mcp.paypal.com/mcp',
    'finance',
    'https://developer.paypal.com/tools/mcp-server/'
  ),
  preset(
    'square',
    'Square',
    'https://mcp.squareup.com/sse',
    'finance',
    'https://developer.squareup.com/docs/mcp'
  ),

  // Infrastructure and hosting
  preset(
    'vercel',
    'Vercel',
    'https://mcp.vercel.com',
    'infrastructure',
    'https://vercel.com/docs/mcp/vercel-mcp'
  ),
  preset(
    'netlify',
    'Netlify',
    'https://netlify-mcp.netlify.app/mcp',
    'infrastructure',
    'https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/'
  ),
  preset(
    'neon',
    'Neon',
    'https://mcp.neon.tech/sse',
    'infrastructure',
    'https://neon.com/docs/ai/neon-mcp-server'
  ),
  preset(
    'supabase',
    'Supabase',
    'https://mcp.supabase.com/mcp',
    'infrastructure',
    'https://supabase.com/docs/guides/getting-started/mcp'
  ),
  preset(
    'box',
    'Box',
    'https://mcp.box.com/',
    'infrastructure',
    'https://developer.box.com/guides/box-mcp/remote/'
  ),
  preset(
    'dropbox',
    'Dropbox',
    'https://mcp.dropbox.com/mcp',
    'infrastructure',
    'https://www.dropbox.com/developers'
  ),

  // Cloudflare runs a server per product area; each is authorized separately.
  preset(
    'cloudflare-bindings',
    'Cloudflare Workers Bindings',
    'https://bindings.mcp.cloudflare.com/mcp',
    'infrastructure',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-builds',
    'Cloudflare Workers Builds',
    'https://builds.mcp.cloudflare.com/mcp',
    'infrastructure',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-observability',
    'Cloudflare Observability',
    'https://observability.mcp.cloudflare.com/mcp',
    'observability',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-radar',
    'Cloudflare Radar',
    'https://radar.mcp.cloudflare.com/mcp',
    'observability',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-containers',
    'Cloudflare Containers',
    'https://containers.mcp.cloudflare.com/mcp',
    'infrastructure',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-browser',
    'Cloudflare Browser Rendering',
    'https://browser.mcp.cloudflare.com/mcp',
    'infrastructure',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-logs',
    'Cloudflare Logs',
    'https://logs.mcp.cloudflare.com/mcp',
    'observability',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-ai-gateway',
    'Cloudflare AI Gateway',
    'https://ai-gateway.mcp.cloudflare.com/mcp',
    'infrastructure',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-autorag',
    'Cloudflare AutoRAG',
    'https://autorag.mcp.cloudflare.com/mcp',
    'infrastructure',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-auditlogs',
    'Cloudflare Audit Logs',
    'https://auditlogs.mcp.cloudflare.com/mcp',
    'security',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),
  preset(
    'cloudflare-graphql',
    'Cloudflare GraphQL Analytics',
    'https://graphql.mcp.cloudflare.com/mcp',
    'observability',
    'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/'
  ),

  // Observability and on-call
  preset(
    'grafana',
    'Grafana',
    'https://mcp.grafana.com/mcp',
    'observability',
    'https://grafana.com/docs/grafana/latest/observability-as-code/mcp-server/'
  ),
  preset(
    'pagerduty',
    'PagerDuty',
    'https://mcp.pagerduty.com/mcp',
    'observability',
    'https://developer.pagerduty.com'
  ),
  preset(
    'globalping',
    'Globalping',
    'https://mcp.globalping.dev/sse',
    'observability',
    'https://globalping.io/docs'
  ),

  // Identity
  preset('workos', 'WorkOS', 'https://mcp.workos.com/mcp', 'security', 'https://workos.com/docs'),
  preset('stytch', 'Stytch', 'https://mcp.stytch.dev/mcp', 'security', 'https://stytch.com/docs'),
]);

export function findMcpServerPreset(key: string): McpServerPreset | undefined {
  return MCP_SERVER_PRESETS.find((entry) => entry.key === key);
}

import type { SupportedServiceId } from '@authlane/shared';

export interface IntegrationExecutionConfig {
  preferred: 'provider_mcp' | 'direct_api';
  provider_mcp?: {
    endpoint: string;
    docs_url: string;
    maturity: 'stable' | 'beta' | 'developer_preview';
  };
  fallback?: 'direct_api';
}

export interface CanonicalIntegrationConfig {
  authorization_url: string;
  token_url: string;
  scopes: readonly string[];
  default_scopes: readonly string[];
  docs_url: string;
  setup_guide_url: string;
  developer_console_url: string;
  execution: IntegrationExecutionConfig;
}

export const CANONICAL_INTEGRATION_CONFIGS = {
  airtable: {
    authorization_url: 'https://airtable.com/oauth2/v1/authorize',
    token_url: 'https://airtable.com/oauth2/v1/token',
    scopes: [
      'data.records:read',
      'data.records:write',
      'data.recordComments:read',
      'data.recordComments:write',
      'schema.bases:read',
      'schema.bases:write',
      'workspacesAndBases:read',
    ],
    default_scopes: [
      'data.records:read',
      'data.records:write',
      'schema.bases:read',
      'workspacesAndBases:read',
    ],
    docs_url: 'https://airtable.com/developers/web/api/introduction',
    setup_guide_url: 'https://airtable.com/developers/web/guides/oauth-integrations',
    developer_console_url: 'https://airtable.com/create/oauth',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://mcp.airtable.com/mcp',
        docs_url: 'https://support.airtable.com/v1/docs/using-the-airtable-mcp-server',
        maturity: 'stable',
      },
      fallback: 'direct_api',
    },
  },
  discord: {
    authorization_url: 'https://discord.com/api/oauth2/authorize',
    token_url: 'https://discord.com/api/oauth2/token',
    scopes: ['identify', 'guilds', 'guilds.members.read', 'connections'],
    default_scopes: ['identify', 'guilds', 'guilds.members.read', 'connections'],
    docs_url: 'https://docs.discord.com/developers/reference',
    setup_guide_url: 'https://docs.discord.com/developers/quick-start/getting-started',
    developer_console_url: 'https://discord.com/developers/applications',
    execution: { preferred: 'direct_api' },
  },
  github: {
    authorization_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'user', 'read:org'],
    default_scopes: ['repo', 'user'],
    docs_url: 'https://docs.github.com/en/rest',
    setup_guide_url:
      'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    developer_console_url: 'https://github.com/settings/developers',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://api.githubcopilot.com/mcp/',
        docs_url:
          'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server',
        maturity: 'stable',
      },
      fallback: 'direct_api',
    },
  },
  gmail: {
    authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.labels',
    ],
    default_scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.labels',
    ],
    docs_url: 'https://developers.google.com/workspace/gmail/api/guides',
    setup_guide_url: 'https://developers.google.com/workspace/guides/configure-oauth-consent',
    developer_console_url: 'https://console.cloud.google.com/apis/credentials',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://gmailmcp.googleapis.com/mcp/v1',
        docs_url:
          'https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server',
        maturity: 'developer_preview',
      },
      fallback: 'direct_api',
    },
  },
  'google-calendar': {
    authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ],
    default_scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    docs_url: 'https://developers.google.com/workspace/calendar/api/guides/overview',
    setup_guide_url: 'https://developers.google.com/workspace/guides/configure-oauth-consent',
    developer_console_url: 'https://console.cloud.google.com/apis/credentials',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://calendarmcp.googleapis.com/mcp/v1',
        docs_url:
          'https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server',
        maturity: 'developer_preview',
      },
      fallback: 'direct_api',
    },
  },
  'google-drive': {
    authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive.appdata',
    ],
    default_scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    docs_url: 'https://developers.google.com/workspace/drive/api/guides/about-sdk',
    setup_guide_url: 'https://developers.google.com/workspace/guides/configure-oauth-consent',
    developer_console_url: 'https://console.cloud.google.com/apis/credentials',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://drivemcp.googleapis.com/mcp/v1',
        docs_url:
          'https://developers.google.com/workspace/drive/api/guides/configure-mcp-server',
        maturity: 'developer_preview',
      },
      fallback: 'direct_api',
    },
  },
  hubspot: {
    authorization_url: 'https://mcp.hubspot.com/oauth/authorize/user',
    token_url: 'https://mcp.hubspot.com/oauth/v3/token',
    scopes: [],
    default_scopes: [],
    docs_url: 'https://developers.hubspot.com/docs/api-reference/overview',
    setup_guide_url:
      'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server',
    developer_console_url: 'https://app.hubspot.com/developer/',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://mcp.hubspot.com',
        docs_url:
          'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server',
        maturity: 'stable',
      },
    },
  },
  jira: {
    authorization_url: 'https://auth.atlassian.com/authorize',
    token_url: 'https://auth.atlassian.com/oauth/token',
    scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'],
    default_scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
    docs_url: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
    setup_guide_url: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/',
    developer_console_url: 'https://developer.atlassian.com/console/myapps/',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://mcp.atlassian.com/v1/mcp/authv2',
        docs_url: 'https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/',
        maturity: 'stable',
      },
      fallback: 'direct_api',
    },
  },
  linear: {
    authorization_url: 'https://linear.app/oauth/authorize',
    token_url: 'https://api.linear.app/oauth/token',
    scopes: ['read', 'write', 'issues:create'],
    default_scopes: ['read', 'write'],
    docs_url: 'https://linear.app/developers',
    setup_guide_url: 'https://linear.app/developers/oauth-2-0-authentication',
    developer_console_url: 'https://linear.app/settings/api',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://mcp.linear.app/mcp',
        docs_url: 'https://linear.app/docs/mcp',
        maturity: 'stable',
      },
      fallback: 'direct_api',
    },
  },
  notion: {
    authorization_url: 'https://api.notion.com/v1/oauth/authorize',
    token_url: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    default_scopes: [],
    docs_url: 'https://developers.notion.com/reference/intro',
    setup_guide_url: 'https://developers.notion.com/docs/create-a-notion-integration',
    developer_console_url: 'https://www.notion.so/profile/integrations',
    execution: {
      preferred: 'direct_api',
      provider_mcp: {
        endpoint: 'https://mcp.notion.com/mcp',
        docs_url: 'https://developers.notion.com/guides/mcp/get-started-with-mcp',
        maturity: 'stable',
      },
    },
  },
  pipedrive: {
    authorization_url: 'https://oauth.pipedrive.com/oauth/authorize',
    token_url: 'https://oauth.pipedrive.com/oauth/token',
    scopes: ['deals:read', 'deals:full', 'contacts:read', 'contacts:full', 'search:read'],
    default_scopes: ['deals:full', 'contacts:full', 'search:read'],
    docs_url: 'https://developers.pipedrive.com/docs/api/v1',
    setup_guide_url: 'https://pipedrive.readme.io/docs/marketplace-oauth-authorization',
    developer_console_url: 'https://pipedrive.readme.io/docs/marketplace-manager',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://mcp.pipedrive.ai/mcp',
        docs_url: 'https://support.pipedrive.com/en/article/mcp-chatgpt',
        maturity: 'beta',
      },
      fallback: 'direct_api',
    },
  },
  salesforce: {
    authorization_url: 'https://login.salesforce.com/services/oauth2/authorize',
    token_url: 'https://login.salesforce.com/services/oauth2/token',
    scopes: [
      'mcp_api',
      'api',
      'refresh_token',
      'offline_access',
      'id',
      'openid',
      'chatter_api',
      'full',
      'web',
    ],
    default_scopes: ['mcp_api', 'api', 'refresh_token', 'id'],
    docs_url: 'https://developer.salesforce.com/docs/platform/hosted-mcp-servers/overview',
    setup_guide_url:
      'https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html',
    developer_console_url: 'https://login.salesforce.com',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://api.salesforce.com/platform/mcp/v1/platform/sobject-all',
        docs_url:
          'https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/client-connection-overview.html',
        maturity: 'stable',
      },
      fallback: 'direct_api',
    },
  },
  slack: {
    authorization_url: 'https://slack.com/oauth/v2_user/authorize',
    token_url: 'https://slack.com/api/oauth.v2.user.access',
    scopes: [
      'chat:write',
      'channels:read',
      'channels:write',
      'groups:read',
      'groups:write',
      'channels:history',
      'groups:history',
      'im:history',
      'im:write',
      'mpim:history',
      'mpim:write',
      'users:read',
      'users.profile:write',
      'search:read.public',
      'search:read.private',
      'search:read.users',
    ],
    default_scopes: [
      'chat:write',
      'channels:read',
      'channels:write',
      'users:read',
      'users.profile:write',
      'search:read.public',
      'search:read.users',
    ],
    docs_url: 'https://docs.slack.dev/reference/methods/',
    setup_guide_url: 'https://docs.slack.dev/ai/slack-mcp-server/developing/',
    developer_console_url: 'https://api.slack.com/apps',
    execution: {
      preferred: 'provider_mcp',
      provider_mcp: {
        endpoint: 'https://mcp.slack.com/mcp',
        docs_url: 'https://docs.slack.dev/ai/slack-mcp-server/',
        maturity: 'stable',
      },
      fallback: 'direct_api',
    },
  },
  stripe: {
    authorization_url: 'https://connect.stripe.com/oauth/authorize',
    token_url: 'https://connect.stripe.com/oauth/token',
    scopes: ['read_only'],
    default_scopes: ['read_only'],
    docs_url: 'https://docs.stripe.com/api',
    setup_guide_url: 'https://docs.stripe.com/connect/oauth-reference',
    developer_console_url: 'https://dashboard.stripe.com/settings/connect',
    execution: {
      preferred: 'direct_api',
      provider_mcp: {
        endpoint: 'https://mcp.stripe.com',
        docs_url: 'https://docs.stripe.com/mcp',
        maturity: 'stable',
      },
    },
  },
} as const satisfies Record<SupportedServiceId, CanonicalIntegrationConfig>;

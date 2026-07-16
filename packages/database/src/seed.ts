/**
 * Database seed script
 * Populates initial data with production-ready service configurations
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { services } from './schema/index.js';

/**
 * Production-ready service configurations
 * Each service has complete OAuth2/API configuration based on official documentation
 */
export const productionServices = [
  // ============================================
  // DEVELOPER TOOLS (4)
  // ============================================
  {
    id: 'github',
    name: 'GitHub',
    authType: 'oauth2',
    config: {
      // OAuth2 endpoints
      authorization_url: 'https://github.com/login/oauth/authorize',
      token_url: 'https://github.com/login/oauth/access_token',
      // API configuration
      api_base_url: 'https://api.github.com',
      // Scopes with descriptions
      scopes: [
        { name: 'repo', description: 'Full control of private repositories', required: false },
        { name: 'repo:status', description: 'Access commit status', required: false },
        { name: 'repo_deployment', description: 'Access deployment status', required: false },
        { name: 'public_repo', description: 'Access public repositories', required: false },
        { name: 'repo:invite', description: 'Access repository invitations', required: false },
        { name: 'user', description: 'Read/write access to profile info', required: false },
        { name: 'user:email', description: 'Access user email addresses', required: false },
        { name: 'user:follow', description: 'Follow and unfollow users', required: false },
        { name: 'read:user', description: 'Read user profile data', required: true },
        { name: 'read:org', description: 'Read org and team membership', required: false },
        {
          name: 'write:org',
          description: 'Read and write org and team membership',
          required: false,
        },
        { name: 'gist', description: 'Create gists', required: false },
        { name: 'notifications', description: 'Access notifications', required: false },
        { name: 'workflow', description: 'Update GitHub Action workflows', required: false },
        {
          name: 'write:packages',
          description: 'Upload packages to GitHub Package Registry',
          required: false,
        },
        {
          name: 'read:packages',
          description: 'Download packages from GitHub Package Registry',
          required: false,
        },
        {
          name: 'delete:packages',
          description: 'Delete packages from GitHub Package Registry',
          required: false,
        },
        { name: 'admin:org', description: 'Full control of orgs and teams', required: false },
        {
          name: 'admin:repo_hook',
          description: 'Full control of repository hooks',
          required: false,
        },
        {
          name: 'admin:org_hook',
          description: 'Full control of organization hooks',
          required: false,
        },
        {
          name: 'project',
          description: 'Read/write access to user and org projects',
          required: false,
        },
        {
          name: 'read:project',
          description: 'Read access to user and org projects',
          required: false,
        },
      ],
      default_scopes: ['read:user', 'repo', 'read:org'],
      // OAuth2 features
      pkce_required: false,
      supports_refresh_token: false, // GitHub doesn't support refresh tokens by default
      // Documentation
      docs_url: 'https://docs.github.com/en/rest',
      setup_guide_url:
        'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
      developer_console_url: 'https://github.com/settings/developers',
    },
    enabled: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://linear.app/oauth/authorize',
      token_url: 'https://api.linear.app/oauth/token',
      api_base_url: 'https://api.linear.app/graphql',
      scopes: [
        { name: 'read', description: 'Read access to your Linear data', required: true },
        { name: 'write', description: 'Write access to your Linear data', required: false },
        { name: 'issues:create', description: 'Create new issues', required: false },
        { name: 'comments:create', description: 'Create comments on issues', required: false },
        { name: 'admin', description: 'Administrative access', required: false },
      ],
      default_scopes: ['read', 'write', 'issues:create'],
      pkce_required: true,
      supports_refresh_token: true,
      docs_url: 'https://developers.linear.app/docs',
      setup_guide_url: 'https://developers.linear.app/docs/oauth/authentication',
      developer_console_url: 'https://linear.app/settings/api',
    },
    enabled: true,
  },
  {
    id: 'jira',
    name: 'Jira',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://auth.atlassian.com/authorize',
      token_url: 'https://auth.atlassian.com/oauth/token',
      api_base_url: 'https://api.atlassian.com/ex/jira',
      // Atlassian requires accessible-resources call to get cloud ID
      accessible_resources_url: 'https://api.atlassian.com/oauth/token/accessible-resources',
      scopes: [
        { name: 'read:jira-work', description: 'Read Jira project and issue data', required: true },
        {
          name: 'write:jira-work',
          description: 'Create and edit issues and projects',
          required: false,
        },
        { name: 'read:jira-user', description: 'Read user information', required: false },
        { name: 'manage:jira-project', description: 'Create and edit projects', required: false },
        {
          name: 'manage:jira-configuration',
          description: 'Configure Jira settings',
          required: false,
        },
        { name: 'manage:jira-webhook', description: 'Manage webhooks', required: false },
        {
          name: 'offline_access',
          description: 'Access when user is offline (refresh tokens)',
          required: true,
        },
      ],
      default_scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'],
      pkce_required: true,
      supports_refresh_token: true,
      // Atlassian-specific
      audience: 'api.atlassian.com',
      prompt: 'consent',
      docs_url: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
      setup_guide_url: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/',
      developer_console_url: 'https://developer.atlassian.com/console/myapps/',
    },
    enabled: true,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://sentry.io/oauth/authorize/',
      token_url: 'https://sentry.io/oauth/token/',
      api_base_url: 'https://sentry.io/api/0',
      scopes: [
        { name: 'project:read', description: 'Read project information', required: true },
        { name: 'project:write', description: 'Write project information', required: false },
        { name: 'project:admin', description: 'Admin access to projects', required: false },
        { name: 'project:releases', description: 'Manage releases', required: false },
        { name: 'team:read', description: 'Read team information', required: false },
        { name: 'team:write', description: 'Write team information', required: false },
        { name: 'team:admin', description: 'Admin access to teams', required: false },
        { name: 'event:read', description: 'Read event data', required: true },
        { name: 'event:write', description: 'Write event data', required: false },
        { name: 'event:admin', description: 'Admin access to events', required: false },
        { name: 'org:read', description: 'Read organization information', required: false },
        { name: 'org:write', description: 'Write organization information', required: false },
        { name: 'member:read', description: 'Read member information', required: false },
        { name: 'member:write', description: 'Write member information', required: false },
      ],
      default_scopes: ['project:read', 'event:read', 'org:read'],
      pkce_required: false,
      supports_refresh_token: true,
      docs_url: 'https://docs.sentry.io/api/',
      setup_guide_url: 'https://docs.sentry.io/api/guides/create-auth-token/',
      developer_console_url: 'https://sentry.io/settings/developer-settings/',
    },
    enabled: true,
  },

  // ============================================
  // COMMUNICATION (3)
  // ============================================
  {
    id: 'slack',
    name: 'Slack',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://slack.com/oauth/v2/authorize',
      token_url: 'https://slack.com/api/oauth.v2.access',
      api_base_url: 'https://slack.com/api',
      scopes: [
        { name: 'channels:read', description: 'View basic channel information', required: true },
        { name: 'channels:write', description: 'Manage public channels', required: false },
        {
          name: 'channels:history',
          description: 'View messages in public channels',
          required: false,
        },
        { name: 'chat:write', description: 'Send messages as the app', required: true },
        {
          name: 'chat:write.public',
          description: 'Send messages to channels without joining',
          required: false,
        },
        { name: 'groups:read', description: 'View private channels', required: false },
        { name: 'groups:write', description: 'Manage private channels', required: false },
        { name: 'im:read', description: 'View direct messages', required: false },
        { name: 'im:write', description: 'Start direct messages', required: false },
        { name: 'mpim:read', description: 'View group direct messages', required: false },
        { name: 'users:read', description: 'View user information', required: true },
        { name: 'users:read.email', description: 'View email addresses', required: false },
        { name: 'team:read', description: 'View workspace information', required: false },
        { name: 'files:read', description: 'View files', required: false },
        { name: 'files:write', description: 'Upload and modify files', required: false },
        { name: 'reactions:read', description: 'View emoji reactions', required: false },
        { name: 'reactions:write', description: 'Add emoji reactions', required: false },
      ],
      default_scopes: ['channels:read', 'chat:write', 'users:read'],
      pkce_required: false,
      supports_refresh_token: true, // With token rotation enabled
      // Slack-specific
      user_scopes: ['identity.basic', 'identity.email'], // For user token flows
      docs_url: 'https://api.slack.com/methods',
      setup_guide_url: 'https://api.slack.com/authentication/oauth-v2',
      developer_console_url: 'https://api.slack.com/apps',
    },
    enabled: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://discord.com/api/oauth2/authorize',
      token_url: 'https://discord.com/api/oauth2/token',
      revoke_url: 'https://discord.com/api/oauth2/token/revoke',
      api_base_url: 'https://discord.com/api/v10',
      scopes: [
        { name: 'identify', description: 'Access username, avatar, and banner', required: true },
        { name: 'email', description: 'Access user email', required: false },
        { name: 'guilds', description: "Access list of user's guilds", required: false },
        { name: 'guilds.join', description: 'Join guilds on behalf of user', required: false },
        { name: 'guilds.members.read', description: 'Read guild member info', required: false },
        { name: 'gdm.join', description: 'Join group DMs', required: false },
        { name: 'messages.read', description: 'Read messages in DMs', required: false },
        { name: 'bot', description: 'Add bot to guild (requires bot scope)', required: false },
        { name: 'webhook.incoming', description: 'Create webhooks', required: false },
        { name: 'applications.commands', description: 'Create slash commands', required: false },
        {
          name: 'applications.commands.update',
          description: 'Update slash commands',
          required: false,
        },
        { name: 'connections', description: 'Access linked third-party accounts', required: false },
      ],
      default_scopes: ['identify', 'guilds'],
      pkce_required: false,
      supports_refresh_token: true,
      docs_url: 'https://discord.com/developers/docs/intro',
      setup_guide_url: 'https://discord.com/developers/docs/topics/oauth2',
      developer_console_url: 'https://discord.com/developers/applications',
    },
    enabled: true,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      revoke_url: 'https://oauth2.googleapis.com/revoke',
      api_base_url: 'https://gmail.googleapis.com/gmail/v1',
      scopes: [
        {
          name: 'https://www.googleapis.com/auth/gmail.readonly',
          description: 'Read all email',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/gmail.send',
          description: 'Send email',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/gmail.compose',
          description: 'Manage drafts and send emails',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/gmail.modify',
          description: 'Read, compose, and send emails',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/gmail.labels',
          description: 'Manage labels',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/gmail.metadata',
          description: 'Read email metadata',
          required: true,
        },
        {
          name: 'https://www.googleapis.com/auth/gmail.settings.basic',
          description: 'Manage basic mail settings',
          required: false,
        },
        { name: 'https://mail.google.com/', description: 'Full access to Gmail', required: false },
      ],
      default_scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      pkce_required: true,
      supports_refresh_token: true,
      // Google-specific
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      docs_url: 'https://developers.google.com/gmail/api/reference/rest',
      setup_guide_url: 'https://developers.google.com/gmail/api/auth/about-auth',
      developer_console_url: 'https://console.cloud.google.com/apis/credentials',
    },
    enabled: true,
  },

  // ============================================
  // PRODUCTIVITY (3)
  // ============================================
  {
    id: 'notion',
    name: 'Notion',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://api.notion.com/v1/oauth/authorize',
      token_url: 'https://api.notion.com/v1/oauth/token',
      api_base_url: 'https://api.notion.com/v1',
      scopes: [
        // Notion doesn't use scopes - access is controlled by which pages/databases
        // the user grants access to during the OAuth flow
      ],
      default_scopes: [],
      pkce_required: false,
      supports_refresh_token: false, // Notion tokens don't expire
      // Notion-specific
      owner: 'user', // Can be 'user' or 'workspace'
      // API version header required
      api_version: '2022-06-28',
      docs_url: 'https://developers.notion.com/reference/intro',
      setup_guide_url: 'https://developers.notion.com/docs/authorization',
      developer_console_url: 'https://www.notion.so/my-integrations',
    },
    enabled: true,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      revoke_url: 'https://oauth2.googleapis.com/revoke',
      api_base_url: 'https://www.googleapis.com/drive/v3',
      scopes: [
        {
          name: 'https://www.googleapis.com/auth/drive',
          description: 'Full access to all Drive files',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/drive.file',
          description: 'Access files created by the app',
          required: true,
        },
        {
          name: 'https://www.googleapis.com/auth/drive.readonly',
          description: 'Read-only access to files',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/drive.metadata',
          description: 'View file metadata',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/drive.metadata.readonly',
          description: 'Read-only metadata',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/drive.appdata',
          description: 'Access app data folder',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/drive.photos.readonly',
          description: 'Access Google Photos',
          required: false,
        },
      ],
      default_scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
      pkce_required: true,
      supports_refresh_token: true,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      docs_url: 'https://developers.google.com/drive/api/reference/rest/v3',
      setup_guide_url: 'https://developers.google.com/drive/api/guides/about-auth',
      developer_console_url: 'https://console.cloud.google.com/apis/credentials',
    },
    enabled: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      revoke_url: 'https://oauth2.googleapis.com/revoke',
      api_base_url: 'https://www.googleapis.com/calendar/v3',
      scopes: [
        {
          name: 'https://www.googleapis.com/auth/calendar',
          description: 'Full access to calendars',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/calendar.readonly',
          description: 'Read-only access to calendars',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/calendar.events',
          description: 'Manage events',
          required: true,
        },
        {
          name: 'https://www.googleapis.com/auth/calendar.events.readonly',
          description: 'Read-only events',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/calendar.settings.readonly',
          description: 'Read calendar settings',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/calendar.calendarlist',
          description: 'Manage calendar list',
          required: false,
        },
        {
          name: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          description: 'Read-only calendar list',
          required: false,
        },
      ],
      default_scopes: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      pkce_required: true,
      supports_refresh_token: true,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      docs_url: 'https://developers.google.com/calendar/api/v3/reference',
      setup_guide_url: 'https://developers.google.com/calendar/api/guides/auth',
      developer_console_url: 'https://console.cloud.google.com/apis/credentials',
    },
    enabled: true,
  },

  // ============================================
  // CRM (3)
  // ============================================
  {
    id: 'hubspot',
    name: 'HubSpot',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://app.hubspot.com/oauth/authorize',
      token_url: 'https://api.hubapi.com/oauth/v1/token',
      api_base_url: 'https://api.hubapi.com',
      scopes: [
        { name: 'crm.objects.contacts.read', description: 'Read contacts', required: true },
        { name: 'crm.objects.contacts.write', description: 'Write contacts', required: false },
        { name: 'crm.objects.companies.read', description: 'Read companies', required: false },
        { name: 'crm.objects.companies.write', description: 'Write companies', required: false },
        { name: 'crm.objects.deals.read', description: 'Read deals', required: false },
        { name: 'crm.objects.deals.write', description: 'Write deals', required: false },
        { name: 'crm.objects.owners.read', description: 'Read owners', required: false },
        { name: 'crm.lists.read', description: 'Read lists', required: false },
        { name: 'crm.lists.write', description: 'Write lists', required: false },
        { name: 'sales-email-read', description: 'Read sales emails', required: false },
        { name: 'forms', description: 'Access forms', required: false },
        { name: 'tickets', description: 'Access tickets', required: false },
        { name: 'e-commerce', description: 'Access e-commerce data', required: false },
        { name: 'automation', description: 'Access workflows', required: false },
        { name: 'timeline', description: 'Access timeline events', required: false },
        { name: 'files', description: 'Access files', required: false },
      ],
      default_scopes: [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.deals.read',
        'crm.objects.deals.write',
      ],
      pkce_required: false,
      supports_refresh_token: true,
      docs_url: 'https://developers.hubspot.com/docs/api/overview',
      setup_guide_url: 'https://developers.hubspot.com/docs/api/working-with-oauth',
      developer_console_url: 'https://app.hubspot.com/developer',
    },
    enabled: true,
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    authType: 'oauth2',
    config: {
      // Note: For sandbox use test.salesforce.com instead of login.salesforce.com
      authorization_url: 'https://login.salesforce.com/services/oauth2/authorize',
      token_url: 'https://login.salesforce.com/services/oauth2/token',
      revoke_url: 'https://login.salesforce.com/services/oauth2/revoke',
      // API base URL is dynamic - instance_url returned in token response
      api_base_url: 'https://{instance_url}/services/data/v60.0',
      scopes: [
        { name: 'api', description: 'Access REST API', required: true },
        { name: 'refresh_token', description: 'Obtain refresh tokens', required: true },
        { name: 'offline_access', description: 'Access data while offline', required: false },
        { name: 'id', description: 'Access identity URL', required: false },
        { name: 'openid', description: 'OpenID Connect', required: false },
        { name: 'profile', description: 'Access profile info', required: false },
        { name: 'email', description: 'Access email', required: false },
        { name: 'full', description: 'Full access', required: false },
        { name: 'chatter_api', description: 'Access Chatter API', required: false },
        { name: 'web', description: 'Access web services', required: false },
        { name: 'custom_permissions', description: 'Access custom permissions', required: false },
        { name: 'pardot_api', description: 'Access Pardot API', required: false },
        { name: 'cdp_api', description: 'Access CDP API', required: false },
      ],
      default_scopes: ['api', 'refresh_token', 'id'],
      pkce_required: true,
      supports_refresh_token: true,
      // Salesforce-specific
      api_version: 'v60.0',
      sandbox_authorization_url: 'https://test.salesforce.com/services/oauth2/authorize',
      sandbox_token_url: 'https://test.salesforce.com/services/oauth2/token',
      docs_url: 'https://developer.salesforce.com/docs/apis',
      setup_guide_url:
        'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm',
      developer_console_url: 'https://login.salesforce.com/',
    },
    enabled: true,
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://oauth.pipedrive.com/oauth/authorize',
      token_url: 'https://oauth.pipedrive.com/oauth/token',
      // API base URL is dynamic - api_domain returned in token response
      api_base_url: 'https://{api_domain}/v1',
      scopes: [
        { name: 'deals:read', description: 'Read deals', required: false },
        { name: 'deals:full', description: 'Full access to deals', required: false },
        {
          name: 'contacts:read',
          description: 'Read contacts (persons/organizations)',
          required: true,
        },
        { name: 'contacts:full', description: 'Full access to contacts', required: false },
        { name: 'activities:read', description: 'Read activities', required: false },
        { name: 'activities:full', description: 'Full access to activities', required: false },
        { name: 'products:read', description: 'Read products', required: false },
        { name: 'products:full', description: 'Full access to products', required: false },
        { name: 'leads:read', description: 'Read leads', required: false },
        { name: 'leads:full', description: 'Full access to leads', required: false },
        { name: 'mail:read', description: 'Read mail', required: false },
        { name: 'mail:full', description: 'Full access to mail', required: false },
        { name: 'goals:read', description: 'Read goals', required: false },
        { name: 'users:read', description: 'Read users', required: false },
        { name: 'admin', description: 'Admin access', required: false },
        {
          name: 'base',
          description: 'Basic access (deprecated, use specific scopes)',
          required: false,
        },
      ],
      default_scopes: ['contacts:read', 'deals:read', 'activities:read'],
      pkce_required: false,
      supports_refresh_token: true,
      docs_url: 'https://developers.pipedrive.com/docs/api/v1',
      setup_guide_url: 'https://pipedrive.readme.io/docs/marketplace-oauth-authorization',
      developer_console_url: 'https://developers.pipedrive.com/',
    },
    enabled: true,
  },

  // ============================================
  // OTHER (2)
  // ============================================
  {
    id: 'stripe',
    name: 'Stripe',
    authType: 'oauth2',
    config: {
      // Stripe Connect OAuth
      authorization_url: 'https://connect.stripe.com/oauth/authorize',
      token_url: 'https://connect.stripe.com/oauth/token',
      deauthorize_url: 'https://connect.stripe.com/oauth/deauthorize',
      api_base_url: 'https://api.stripe.com/v1',
      scopes: [
        { name: 'read_write', description: 'Full access to Stripe account', required: false },
        { name: 'read_only', description: 'Read-only access', required: true },
      ],
      default_scopes: ['read_only'],
      pkce_required: false,
      supports_refresh_token: true,
      // Stripe-specific
      stripe_landing: 'login', // Can be 'login' or 'register'
      response_type: 'code',
      docs_url: 'https://stripe.com/docs/api',
      setup_guide_url: 'https://stripe.com/docs/connect/oauth-reference',
      developer_console_url: 'https://dashboard.stripe.com/settings/connect',
    },
    enabled: true,
  },
  {
    id: 'airtable',
    name: 'Airtable',
    authType: 'oauth2',
    config: {
      authorization_url: 'https://airtable.com/oauth2/v1/authorize',
      token_url: 'https://airtable.com/oauth2/v1/token',
      api_base_url: 'https://api.airtable.com/v0',
      scopes: [
        { name: 'data.records:read', description: 'Read records', required: true },
        {
          name: 'data.records:write',
          description: 'Create, update, delete records',
          required: false,
        },
        { name: 'data.recordComments:read', description: 'Read record comments', required: false },
        {
          name: 'data.recordComments:write',
          description: 'Write record comments',
          required: false,
        },
        { name: 'schema.bases:read', description: 'Read base schema', required: true },
        { name: 'schema.bases:write', description: 'Modify base schema', required: false },
        { name: 'user.email:read', description: 'Read user email', required: false },
        { name: 'webhook:manage', description: 'Manage webhooks', required: false },
      ],
      default_scopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
      pkce_required: true,
      supports_refresh_token: true,
      // Airtable-specific
      response_type: 'code',
      docs_url: 'https://airtable.com/developers/web/api/introduction',
      setup_guide_url: 'https://airtable.com/developers/web/guides/oauth-integrations',
      developer_console_url: 'https://airtable.com/create/oauth',
    },
    enabled: true,
  },

  // ============================================
  // PUBLIC APIs (no authentication required)
  // These can be tested immediately after seeding!
  // ============================================
  {
    id: 'jsonplaceholder',
    name: 'JSONPlaceholder',
    authType: 'none',
    config: {
      api_base_url: 'https://jsonplaceholder.typicode.com',
      description: 'Free fake REST API for testing and prototyping',
      requires_auth: false,
      endpoints: [
        { path: '/posts', method: 'GET', description: 'Get all posts' },
        { path: '/posts/{id}', method: 'GET', description: 'Get post by ID' },
        { path: '/posts', method: 'POST', description: 'Create a post' },
        { path: '/comments', method: 'GET', description: 'Get all comments' },
        { path: '/users', method: 'GET', description: 'Get all users' },
        { path: '/todos', method: 'GET', description: 'Get all todos' },
        { path: '/albums', method: 'GET', description: 'Get all albums' },
        { path: '/photos', method: 'GET', description: 'Get all photos' },
      ],
      rate_limit: 'Unlimited',
      docs_url: 'https://jsonplaceholder.typicode.com/guide/',
      example_call: 'curl https://jsonplaceholder.typicode.com/posts/1',
    },
    enabled: true,
  },
  {
    id: 'restcountries',
    name: 'REST Countries',
    authType: 'none',
    config: {
      api_base_url: 'https://restcountries.com/v3.1',
      description: 'Get information about countries via REST API',
      requires_auth: false,
      endpoints: [
        { path: '/all', method: 'GET', description: 'Get all countries' },
        { path: '/name/{name}', method: 'GET', description: 'Search by country name' },
        { path: '/alpha/{code}', method: 'GET', description: 'Get by country code (ISO 3166-1)' },
        { path: '/currency/{currency}', method: 'GET', description: 'Get by currency' },
        { path: '/lang/{language}', method: 'GET', description: 'Get by language' },
        { path: '/capital/{capital}', method: 'GET', description: 'Get by capital city' },
        { path: '/region/{region}', method: 'GET', description: 'Get by region' },
        { path: '/subregion/{subregion}', method: 'GET', description: 'Get by subregion' },
      ],
      rate_limit: 'Unlimited',
      docs_url: 'https://restcountries.com/',
      example_call: 'curl https://restcountries.com/v3.1/name/czech',
    },
    enabled: true,
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    authType: 'none',
    config: {
      api_base_url: 'https://openlibrary.org',
      description: 'Free book data API from Internet Archive',
      requires_auth: false,
      endpoints: [
        { path: '/search.json?q={query}', method: 'GET', description: 'Search books' },
        { path: '/works/{olid}.json', method: 'GET', description: 'Get work by Open Library ID' },
        { path: '/books/{olid}.json', method: 'GET', description: 'Get book edition' },
        { path: '/authors/{olid}.json', method: 'GET', description: 'Get author info' },
        { path: '/isbn/{isbn}.json', method: 'GET', description: 'Get book by ISBN' },
        { path: '/subjects/{subject}.json', method: 'GET', description: 'Get books by subject' },
      ],
      rate_limit: 'Reasonable use',
      docs_url: 'https://openlibrary.org/developers/api',
      example_call: 'curl "https://openlibrary.org/search.json?q=the+lord+of+the+rings"',
    },
    enabled: true,
  },
  {
    id: 'pokeapi',
    name: 'PokéAPI',
    authType: 'none',
    config: {
      api_base_url: 'https://pokeapi.co/api/v2',
      description: 'All the Pokémon data you will ever need',
      requires_auth: false,
      endpoints: [
        { path: '/pokemon', method: 'GET', description: 'List all Pokémon' },
        { path: '/pokemon/{id}', method: 'GET', description: 'Get Pokémon by ID or name' },
        { path: '/type', method: 'GET', description: 'List all types' },
        { path: '/ability', method: 'GET', description: 'List all abilities' },
        { path: '/move', method: 'GET', description: 'List all moves' },
        { path: '/generation', method: 'GET', description: 'List all generations' },
        { path: '/item', method: 'GET', description: 'List all items' },
        { path: '/location', method: 'GET', description: 'List all locations' },
      ],
      rate_limit: '100 requests/minute per IP',
      docs_url: 'https://pokeapi.co/docs/v2',
      example_call: 'curl https://pokeapi.co/api/v2/pokemon/pikachu',
    },
    enabled: true,
  },
  {
    id: 'catfacts',
    name: 'Cat Facts',
    authType: 'none',
    config: {
      api_base_url: 'https://catfact.ninja',
      description: 'Daily cat facts API',
      requires_auth: false,
      endpoints: [
        { path: '/fact', method: 'GET', description: 'Get a random cat fact' },
        { path: '/facts', method: 'GET', description: 'Get a list of cat facts' },
        { path: '/breeds', method: 'GET', description: 'Get a list of cat breeds' },
      ],
      rate_limit: 'Unlimited',
      docs_url: 'https://catfact.ninja/',
      example_call: 'curl https://catfact.ninja/fact',
    },
    enabled: true,
  },
  {
    id: 'dummyjson',
    name: 'DummyJSON',
    authType: 'none',
    config: {
      api_base_url: 'https://dummyjson.com',
      description: 'Fake REST API with realistic data for testing',
      requires_auth: false,
      endpoints: [
        { path: '/products', method: 'GET', description: 'Get all products' },
        { path: '/products/{id}', method: 'GET', description: 'Get product by ID' },
        { path: '/products/search?q={query}', method: 'GET', description: 'Search products' },
        { path: '/users', method: 'GET', description: 'Get all users' },
        { path: '/carts', method: 'GET', description: 'Get all carts' },
        { path: '/posts', method: 'GET', description: 'Get all posts' },
        { path: '/comments', method: 'GET', description: 'Get all comments' },
        { path: '/quotes', method: 'GET', description: 'Get all quotes' },
        { path: '/recipes', method: 'GET', description: 'Get all recipes' },
      ],
      rate_limit: 'Unlimited',
      docs_url: 'https://dummyjson.com/docs',
      example_call: 'curl https://dummyjson.com/products/1',
    },
    enabled: true,
  },

  // ============================================
  // API KEY Services (simple configuration)
  // Just add your API key to start using!
  // ============================================
  {
    id: 'openai',
    name: 'OpenAI',
    authType: 'api_key',
    config: {
      api_base_url: 'https://api.openai.com/v1',
      description: 'AI models including GPT-4, DALL-E, Whisper',
      auth_header: 'Authorization',
      auth_prefix: 'Bearer',
      endpoints: [
        { path: '/chat/completions', method: 'POST', description: 'Chat with GPT models' },
        { path: '/completions', method: 'POST', description: 'Text completions (legacy)' },
        { path: '/images/generations', method: 'POST', description: 'Generate images with DALL-E' },
        {
          path: '/audio/transcriptions',
          method: 'POST',
          description: 'Transcribe audio with Whisper',
        },
        { path: '/audio/speech', method: 'POST', description: 'Text to speech' },
        { path: '/embeddings', method: 'POST', description: 'Create embeddings' },
        { path: '/models', method: 'GET', description: 'List available models' },
      ],
      rate_limit: 'Varies by plan and model',
      docs_url: 'https://platform.openai.com/docs/api-reference',
      setup_guide_url: 'https://platform.openai.com/api-keys',
      example_call:
        'curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"',
    },
    enabled: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    authType: 'api_key',
    config: {
      api_base_url: 'https://api.anthropic.com/v1',
      description: 'Claude AI models for conversation and analysis',
      auth_header: 'x-api-key',
      auth_prefix: '',
      additional_headers: {
        'anthropic-version': '2023-06-01',
      },
      endpoints: [
        { path: '/messages', method: 'POST', description: 'Create a message with Claude' },
        { path: '/messages', method: 'POST', description: 'Streaming messages' },
      ],
      rate_limit: 'Varies by plan',
      docs_url: 'https://docs.anthropic.com/en/api/getting-started',
      setup_guide_url: 'https://console.anthropic.com/settings/keys',
      example_call:
        'curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"',
    },
    enabled: true,
  },
  {
    id: 'resend',
    name: 'Resend',
    authType: 'api_key',
    config: {
      api_base_url: 'https://api.resend.com',
      description: 'Modern email API for developers',
      auth_header: 'Authorization',
      auth_prefix: 'Bearer',
      endpoints: [
        { path: '/emails', method: 'POST', description: 'Send an email' },
        { path: '/emails/{id}', method: 'GET', description: 'Get email details' },
        { path: '/domains', method: 'GET', description: 'List domains' },
        { path: '/domains', method: 'POST', description: 'Add a domain' },
        { path: '/api-keys', method: 'GET', description: 'List API keys' },
      ],
      rate_limit: '100 emails/day (free tier)',
      docs_url: 'https://resend.com/docs/api-reference/introduction',
      setup_guide_url: 'https://resend.com/api-keys',
      example_call:
        'curl https://api.resend.com/emails -H "Authorization: Bearer $RESEND_API_KEY" -d \'{"from":"...","to":"...","subject":"...","html":"..."}\'',
    },
    enabled: true,
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    authType: 'api_key',
    config: {
      api_base_url: 'https://api.sendgrid.com/v3',
      description: 'Email delivery service by Twilio',
      auth_header: 'Authorization',
      auth_prefix: 'Bearer',
      endpoints: [
        { path: '/mail/send', method: 'POST', description: 'Send an email' },
        { path: '/templates', method: 'GET', description: 'List email templates' },
        { path: '/contactdb/recipients', method: 'GET', description: 'List recipients' },
        { path: '/stats', method: 'GET', description: 'Get email statistics' },
        { path: '/suppressions/bounces', method: 'GET', description: 'List bounced emails' },
      ],
      rate_limit: '100 emails/day (free tier)',
      docs_url: 'https://docs.sendgrid.com/api-reference',
      setup_guide_url: 'https://app.sendgrid.com/settings/api_keys',
      example_call:
        'curl https://api.sendgrid.com/v3/mail/send -H "Authorization: Bearer $SENDGRID_API_KEY"',
    },
    enabled: true,
  },
  {
    id: 'openweathermap',
    name: 'OpenWeatherMap',
    authType: 'api_key',
    config: {
      api_base_url: 'https://api.openweathermap.org/data/2.5',
      description: 'Weather data API with current and forecast data',
      auth_type: 'query_param',
      auth_param: 'appid',
      endpoints: [
        { path: '/weather?q={city}', method: 'GET', description: 'Current weather by city' },
        {
          path: '/weather?lat={lat}&lon={lon}',
          method: 'GET',
          description: 'Current weather by coordinates',
        },
        { path: '/forecast?q={city}', method: 'GET', description: '5-day forecast' },
        {
          path: '/air_pollution?lat={lat}&lon={lon}',
          method: 'GET',
          description: 'Air quality data',
        },
        {
          path: '/onecall?lat={lat}&lon={lon}',
          method: 'GET',
          description: 'One Call API (all data)',
        },
      ],
      rate_limit: '60 calls/minute (free tier)',
      docs_url: 'https://openweathermap.org/api',
      setup_guide_url: 'https://home.openweathermap.org/api_keys',
      example_call:
        'curl "https://api.openweathermap.org/data/2.5/weather?q=Prague&appid=$OPENWEATHERMAP_API_KEY"',
    },
    enabled: true,
  },
  {
    id: 'exchangerate',
    name: 'ExchangeRate-API',
    authType: 'api_key',
    config: {
      api_base_url: 'https://v6.exchangerate-api.com/v6',
      description: 'Currency exchange rate API',
      auth_type: 'path',
      endpoints: [
        {
          path: '/{apikey}/latest/{base}',
          method: 'GET',
          description: 'Latest rates for a base currency',
        },
        { path: '/{apikey}/pair/{from}/{to}', method: 'GET', description: 'Pair conversion rate' },
        {
          path: '/{apikey}/pair/{from}/{to}/{amount}',
          method: 'GET',
          description: 'Convert amount',
        },
        { path: '/{apikey}/codes', method: 'GET', description: 'List supported currency codes' },
      ],
      rate_limit: '1500 requests/month (free tier)',
      docs_url: 'https://www.exchangerate-api.com/docs/overview',
      setup_guide_url: 'https://app.exchangerate-api.com/dashboard',
      example_call: 'curl https://v6.exchangerate-api.com/v6/$API_KEY/latest/USD',
    },
    enabled: true,
  },
];

/**
 * Seeds the database with initial data
 */
export async function seedDatabase(dbUrl: string) {
  const client = postgres(dbUrl);
  const db = drizzle(client, { schema: { services } });

  console.log('🌱 Seeding database with production-ready service configurations...\n');

  // Insert all services
  console.log('📦 Seeding services:');
  for (const service of productionServices) {
    await db.insert(services).values(service).onConflictDoUpdate({
      target: services.id,
      set: service,
    });
    console.log(`  ✓ ${service.name} (${service.id})`);
  }
  console.log(`\n  Total: ${productionServices.length} services seeded\n`);

  // Print helpful information
  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ Database seeded successfully!\n');

  // Categorize services
  const publicApis = productionServices.filter((s) => s.authType === 'none');
  const apiKeyServices = productionServices.filter((s) => s.authType === 'api_key');
  const oauthServices = productionServices.filter((s) => s.authType === 'oauth2');

  console.log(`\n${'─'.repeat(70)}`);
  console.log('🚀 PUBLIC APIs - Ready to use NOW! No configuration needed:');
  console.log('─'.repeat(70));
  for (const service of publicApis) {
    const config = service.config as { api_base_url: string; example_call?: string };
    console.log(`\n   ${service.name}`);
    console.log(`   └─ ${config.api_base_url}`);
    if (config.example_call) {
      console.log(`   └─ Try: ${config.example_call}`);
    }
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log('🔐 API KEY Services - Just add your API key:');
  console.log('─'.repeat(70));
  for (const service of apiKeyServices) {
    const config = service.config as { setup_guide_url?: string; docs_url?: string };
    console.log(`\n   ${service.name}`);
    console.log(`   └─ Get key: ${config.setup_guide_url || config.docs_url || 'See docs'}`);
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log('🔗 OAuth2 Services - Need Client ID + Client Secret:');
  console.log('─'.repeat(70));
  for (const service of oauthServices) {
    const config = service.config as { developer_console_url?: string };
    console.log(`   • ${service.name}: ${config.developer_console_url || 'See docs'}`);
  }

  console.log('\n   💡 Google Services (Gmail, Drive, Calendar):');
  console.log('   └─ Create ONE OAuth app: https://console.cloud.google.com/apis/credentials');
  console.log('   └─ Enable APIs: Gmail API, Drive API, Calendar API');

  console.log(`\n${'─'.repeat(70)}`);
  console.log('📊 Summary:');
  console.log('─'.repeat(70));
  console.log(`   • ${publicApis.length} Public APIs (no auth needed) ✅`);
  console.log(`   • ${apiKeyServices.length} API Key services (simple setup)`);
  console.log(`   • ${oauthServices.length} OAuth2 services (need app setup)`);
  console.log(`   • Total: ${productionServices.length} services`);

  console.log(`\n${'='.repeat(70)}\n`);

  // Close the connection to ensure all queries are committed
  await client.end();
}

// Run if called directly
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js');

if (isMainModule) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  seedDatabase(dbUrl)
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

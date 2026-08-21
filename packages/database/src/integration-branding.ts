import type { ServiceCategory, SupportedServiceId } from '@authlane/shared';

/**
 * What a consuming application needs to render a service, mirrored from `integrations/<id>/config.yaml`.
 *
 * Deliberately separate from CANONICAL_INTEGRATION_CONFIGS: the seed spreads that object straight
 * into the `config` jsonb column, which is the OAuth and execution contract and is asserted
 * field-for-field against the yaml. Display metadata belongs in typed columns a consumer can select,
 * document in OpenAPI, and read without unwrapping an untyped record.
 *
 * The icon is not here. It is derived from the service id by the seed, because the file that backs
 * it (`integrations/<id>/icon.svg`) is named by the same id and a second spelling would only be a
 * chance to disagree.
 */
export interface CanonicalIntegrationBranding {
  /**
   * The provider's own spelling of its name, and the only one.
   *
   * The seed used to title-case the service id whenever no literal existed for it, which is how
   * `microsoft-sharepoint` reached consumers as "Microsoft Sharepoint" while its own manifest said
   * "Microsoft Drive (SharePoint)", and `attio` as "Attio" against a manifest saying "Attio CRM".
   */
  name: string;
  /** One sentence an end user reads to decide whether to connect. Kept under 140 characters. */
  description: string;
  /** The provider's own mark colour, lowercase hex. Used behind the initials when the icon fails. */
  brandColor: string;
  /** Hand-tuned rather than derived: GitHub reads as GH, and three Microsoft services would collide. */
  initials: string;
  category: ServiceCategory;
}

export const CANONICAL_INTEGRATION_BRANDING: Record<
  SupportedServiceId,
  CanonicalIntegrationBranding
> = {
  airtable: {
    name: 'Airtable',
    description: 'Bases, tables, and records, with the schema behind them.',
    brandColor: '#18bfff',
    initials: 'AT',
    category: 'productivity',
  },
  attio: {
    name: 'Attio CRM',
    description: 'Records, lists, notes, and tasks in your CRM workspace.',
    brandColor: '#5e35b1',
    initials: 'AO',
    category: 'crm',
  },
  discord: {
    name: 'Discord',
    description: 'Servers, channels, and messages your account can reach.',
    brandColor: '#5865f2',
    initials: 'DC',
    category: 'communication',
  },
  github: {
    name: 'GitHub',
    description: 'Repositories, issues, pull requests, and code search.',
    brandColor: '#181717',
    initials: 'GH',
    category: 'engineering',
  },
  gmail: {
    name: 'Gmail',
    description: 'Read, search, and send mail from your Gmail account.',
    brandColor: '#ea4335',
    initials: 'GM',
    category: 'communication',
  },
  'google-calendar': {
    name: 'Google Calendar',
    description: 'Events, availability, and scheduling across your calendars.',
    brandColor: '#4285f4',
    initials: 'GC',
    category: 'productivity',
  },
  'google-drive': {
    name: 'Google Drive',
    description: 'Files and folders in Drive, including their contents.',
    brandColor: '#1fa463',
    initials: 'GD',
    category: 'storage',
  },
  hubspot: {
    name: 'HubSpot',
    description: 'Contacts, companies, deals, and engagements in your CRM.',
    brandColor: '#ff7a59',
    initials: 'HS',
    category: 'crm',
  },
  jira: {
    name: 'Jira',
    description: 'Issues, projects, and sprints across your Jira sites.',
    brandColor: '#0052cc',
    initials: 'JR',
    category: 'engineering',
  },
  linear: {
    name: 'Linear',
    description: 'Issues, projects, and cycles in your Linear workspace.',
    brandColor: '#5e6ad2',
    initials: 'LN',
    category: 'engineering',
  },
  'microsoft-calendar': {
    name: 'Microsoft Calendar',
    description: 'Events and availability in your Outlook calendar.',
    brandColor: '#0078d4',
    initials: 'MC',
    category: 'productivity',
  },
  'microsoft-mail': {
    name: 'Microsoft Mail',
    description: 'Read, search, and send mail from your Outlook mailbox.',
    brandColor: '#0078d4',
    initials: 'MM',
    category: 'communication',
  },
  'microsoft-sharepoint': {
    name: 'Microsoft Drive (SharePoint)',
    description: 'Sites, document libraries, and files in SharePoint.',
    brandColor: '#038387',
    initials: 'SP',
    category: 'storage',
  },
  notion: {
    name: 'Notion',
    description: 'Pages, databases, and blocks in your Notion workspace.',
    brandColor: '#000000',
    initials: 'NO',
    category: 'productivity',
  },
  pipedrive: {
    name: 'Pipedrive',
    description: 'Deals, contacts, and activities in your sales pipeline.',
    brandColor: '#017737',
    initials: 'PD',
    category: 'crm',
  },
  salesforce: {
    name: 'Salesforce',
    description: 'Accounts, opportunities, and custom objects in your org.',
    brandColor: '#00a1e0',
    initials: 'SF',
    category: 'crm',
  },
  slack: {
    name: 'Slack',
    description: 'Channels, messages, and files across your workspace.',
    brandColor: '#611f69',
    initials: 'SL',
    category: 'communication',
  },
  stripe: {
    name: 'Stripe',
    description: 'Customers, payments, subscriptions, and invoices.',
    brandColor: '#635bff',
    initials: 'ST',
    category: 'finance',
  },
};

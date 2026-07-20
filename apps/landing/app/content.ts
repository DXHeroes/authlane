export const serviceGroups = [
  {
    name: 'Developer tools',
    services: [
      { id: 'github', name: 'GitHub' },
      { id: 'linear', name: 'Linear' },
      { id: 'jira', name: 'Jira' },
    ],
  },
  {
    name: 'Communication',
    services: [
      { id: 'slack', name: 'Slack' },
      { id: 'discord', name: 'Discord' },
      { id: 'gmail', name: 'Gmail' },
      { id: 'microsoft-mail', name: 'Microsoft Mail' },
    ],
  },
  {
    name: 'Productivity',
    services: [
      { id: 'notion', name: 'Notion' },
      { id: 'google-drive', name: 'Google Drive' },
      { id: 'google-calendar', name: 'Google Calendar' },
      { id: 'microsoft-sharepoint', name: 'Microsoft Drive (SharePoint)' },
      { id: 'microsoft-calendar', name: 'Microsoft Calendar' },
    ],
  },
  {
    name: 'CRM',
    services: [
      { id: 'hubspot', name: 'HubSpot' },
      { id: 'salesforce', name: 'Salesforce' },
      { id: 'pipedrive', name: 'Pipedrive' },
      { id: 'attio', name: 'Attio' },
    ],
  },
  {
    name: 'Other',
    services: [
      { id: 'stripe', name: 'Stripe' },
      { id: 'airtable', name: 'Airtable' },
    ],
  },
] as const;

export const developerSteps = [
  {
    id: 'load-services',
    index: '01',
    title: 'Load services',
    description: 'SDK or REST API from your backend.',
  },
  {
    id: 'offer-services',
    index: '02',
    title: 'Offer them in your UI',
    description: 'Your layout and product experience.',
  },
  {
    id: 'connect-user',
    index: '03',
    title: 'Connect by user ID',
    description: 'A short-lived, origin-bound session.',
  },
  {
    id: 'use-tools',
    index: '04',
    title: 'Give tools to your agent',
    description: 'Vercel AI, OpenAI Agents, Mastra, or MCP.',
  },
] as const;

export const landingLinks = {
  app: 'https://app.authlane.io',
  signIn: 'https://app.authlane.io/login',
  docs: 'https://authlane.io/docs',
  github: 'https://github.com/dxheroes/authlane',
} as const;

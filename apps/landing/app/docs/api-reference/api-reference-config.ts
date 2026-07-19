import type { AnyApiReferenceConfiguration } from '@scalar/api-reference-react';

export const authlaneScalarConfig = {
  url: '/docs/openapi.json',
  theme: 'none',
  layout: 'modern',
  documentDownloadType: 'both',
  defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
  hideTestRequestButton: true,
  hideClientButton: true,
  showDeveloperTools: 'never',
  withDefaultFonts: false,
  telemetry: false,
  persistAuth: false,
  showOperationId: true,
  modelsSectionLabel: 'Schemas',
  orderRequiredPropertiesFirst: true,
  agent: { disabled: true },
} satisfies AnyApiReferenceConfiguration;

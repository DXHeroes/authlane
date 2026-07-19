import { describe, expect, it } from 'vitest';
import { authlaneScalarConfig } from './api-reference-config';

describe('Authlane Scalar configuration', () => {
  it('keeps the API reference local, read-only, and credential-free', () => {
    expect(authlaneScalarConfig).toMatchObject({
      url: '/docs/openapi.json',
      hideTestRequestButton: true,
      hideClientButton: true,
      hiddenClients: true,
      showDeveloperTools: 'never',
      withDefaultFonts: false,
      telemetry: false,
      persistAuth: false,
      showOperationId: true,
      modelsSectionLabel: 'Schemas',
      orderRequiredPropertiesFirst: true,
      agent: { disabled: true },
      mcp: { disabled: true },
    });
    expect(authlaneScalarConfig).not.toHaveProperty('proxyUrl');
    expect(authlaneScalarConfig).not.toHaveProperty('authentication');
    expect(authlaneScalarConfig).not.toHaveProperty('plugins');
  });
});

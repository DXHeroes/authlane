import { SUPPORTED_SERVICE_IDS } from '@authlane/shared';
import { describe, expect, it } from 'vitest';
import { developerSteps, serviceGroups } from './content';

describe('landing content', () => {
  it('lists exactly the shipped integrations', () => {
    const ids = serviceGroups.flatMap((group) => group.services.map((service) => service.id));
    expect([...ids].sort()).toEqual([...SUPPORTED_SERVICE_IDS].sort());
  });

  it('keeps the complete developer journey', () => {
    expect(developerSteps.map((step) => step.id)).toEqual([
      'load-services',
      'offer-services',
      'connect-user',
      'use-tools',
    ]);
  });
});

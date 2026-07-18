import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeveloperJourney } from './developer-journey';

Object.assign(globalThis, { React });
afterEach(cleanup);

describe('DeveloperJourney', () => {
  it('shows an initialized SDK and all four identity-bound integration steps', () => {
    render(<DeveloperJourney />);

    const steps = screen.getByLabelText('Four-step Authlane integration journey');
    const journey = screen
      .getByRole('heading', { name: 'First success, not first configuration' })
      .closest('section');
    expect(steps.querySelectorAll('[data-journey-step]')).toHaveLength(4);
    expect(journey).not.toBeNull();
    expect(journey?.textContent).toContain("import { Authlane } from '@authlane/sdk'");
    expect(journey?.textContent).toContain('new Authlane({');
    expect(journey?.textContent).toContain("externalUserId: 'user_123'");
    expect(journey?.textContent).toContain('allowedServices: []');
    expect(journey?.textContent).toContain('An empty list allows every tenant-enabled service');
  });

  it('switches catalog and framework examples accessibly', async () => {
    const user = userEvent.setup();
    render(<DeveloperJourney />);

    await user.click(screen.getByRole('tab', { name: 'REST API' }));
    expect(screen.getByRole('tabpanel', { name: 'REST API' }).textContent).toContain(
      '/api/v1/catalog/services'
    );

    await user.click(screen.getByRole('tab', { name: 'OpenAI Agents' }));
    expect(screen.getByRole('tabpanel', { name: 'OpenAI Agents' }).textContent).toContain(
      'openAIAgents()'
    );
    expect(screen.getByRole('tab', { name: 'REST API' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.getByRole('tabpanel', { name: 'REST API' }).textContent).toContain(
      '/api/v1/catalog/services'
    );
    expect(screen.getByRole('tab', { name: 'OpenAI Agents' }).getAttribute('aria-selected')).toBe(
      'true'
    );

    await user.click(screen.getByRole('tab', { name: 'Mastra' }));
    expect(screen.getByRole('tabpanel', { name: 'Mastra' }).textContent).toContain('mastraAI()');
  });

  it('renders build-time syntax token markup instead of unhighlighted code', () => {
    const { container } = render(<DeveloperJourney />);

    expect(container.querySelector('pre code .token')).not.toBeNull();
  });
});

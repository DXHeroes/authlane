import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { DeveloperJourney } from './developer-journey';

Object.assign(globalThis, { React });

describe('DeveloperJourney', () => {
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
  });
});

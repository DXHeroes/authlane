import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import Home from './page';

Object.assign(globalThis, { React });

function expectVisible(element: HTMLElement) {
  expect(element.hidden).toBe(false);
  expect(element.getAttribute('aria-hidden')).not.toBe('true');
}

describe('Authlane landing', () => {
  it('communicates the product boundary and complete journey', () => {
    render(<Home />);
    expectVisible(
      screen.getByRole('heading', { level: 1, name: 'Connected tools. Your traffic.' })
    );
    expectVisible(screen.getByText('Connect once'));
    expectVisible(screen.getByText('Use everywhere'));
    expectVisible(screen.getByText('Authlane is not in this path'));
    expect(
      screen.getAllByText(
        /Load services|Offer them in your UI|Connect by user ID|Give tools to your agent/
      )
    ).toHaveLength(4);
  });

  it('does not render unsupported marketing claims', () => {
    const { container } = render(<Home />);
    expect(container.textContent).not.toMatch(
      /50\+|hundreds of developers|SLA guarantee|execute through Authlane/i
    );
    expect(container.querySelectorAll('[data-primary-cta]')).toHaveLength(1);
  });

  it('teaches the non-throwing SDK result contract before using data', () => {
    const { container } = render(<Home />);
    const codeSamples = Array.from(container.querySelectorAll('code'), (sample) =>
      sample.textContent?.trim()
    ).filter((sample): sample is string => Boolean(sample));
    const sdkContracts = [
      {
        call: 'authlane.services.list()',
        result: 'data: services, error',
        safeUse: 'return services;',
      },
      {
        call: 'authlane.connectSessions.create',
        result: 'data: session, error',
        safeUse: 'session.url',
      },
      {
        call: 'adapter: vercelAI()',
        result: 'data: tools, error',
        safeUse: 'return streamText({ model, messages, tools });',
      },
      {
        call: 'adapter: openAIAgents()',
        result: 'data: tools, error',
        safeUse: "new Agent({ name: 'Support', tools })",
      },
      {
        call: 'adapter: mcpServer()',
        result: 'data: server, error',
        safeUse: 'server.connect(transport)',
      },
    ];

    for (const contract of sdkContracts) {
      const sample = codeSamples.find((code) => code.includes(contract.call));
      expect(sample, `missing SDK example for ${contract.call}`).toBeDefined();
      if (!sample) continue;
      expect(sample).toContain(`const { ${contract.result} } = await`);
      expect(sample).toContain('if (error)');
      expect(sample.indexOf(contract.safeUse)).toBeGreaterThan(sample.indexOf('if (error)'));
    }
  });

  it('does not link the footer to unpublished legal routes', () => {
    const { container } = render(<Home />);
    const footerNavigation = container.querySelector<HTMLElement>(
      'footer nav[aria-label="Footer navigation"]'
    );
    expect(footerNavigation).not.toBeNull();
    if (!footerNavigation) return;
    const footerLinks = Array.from(footerNavigation.querySelectorAll('a'));

    expect(footerLinks.map((link) => link.getAttribute('href'))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\/(privacy|terms)\/?$/)])
    );
    expect(footerNavigation.textContent).not.toMatch(/Privacy|Terms/);
  });
});

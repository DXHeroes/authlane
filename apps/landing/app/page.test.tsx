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
});

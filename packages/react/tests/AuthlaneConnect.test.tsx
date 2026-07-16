import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthlaneConnect } from '../src/AuthlaneConnect.js';

describe('AuthlaneConnect', () => {
  it('embeds only the short-lived connect URL and never accepts an API key', () => {
    render(<AuthlaneConnect connectUrl="about:blank?session=acs_short_lived" />);

    const iframe = screen.getByTitle('Connect services');
    expect(iframe.getAttribute('src')).toBe('about:blank?session=acs_short_lived');
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-popups allow-forms'
    );
  });
});

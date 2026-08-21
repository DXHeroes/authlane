import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServiceMark } from '@/components/ServiceMark';
import { render } from '../utils/test-utils';

const github = {
  name: 'GitHub',
  iconUrl: 'https://app.authlane.io/service-icons/github.svg',
  brandColor: '#181717',
  initials: 'GH',
};

describe('ServiceMark', () => {
  it('renders the mark Authlane serves', () => {
    const { container } = render(<ServiceMark service={github} />);

    expect(container.querySelector('img')).toHaveAttribute('src', github.iconUrl);
  });

  it('draws the initials over the brand colour when no mark is served', () => {
    // Slack, Salesforce, and the Microsoft services take this path on purpose.
    const { container } = render(
      <ServiceMark service={{ ...github, name: 'Slack', iconUrl: null, initials: 'SL' }} />
    );

    expect(screen.getByText('SL')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back when the image itself fails', () => {
    const { container } = render(<ServiceMark service={github} />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(screen.getByText('GH')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the dashboard theme when a service declares no brand colour', () => {
    // Nothing is invented for a service whose colour could not be sourced.
    const { container } = render(
      <ServiceMark service={{ ...github, iconUrl: null, brandColor: null }} />
    );

    expect(container.firstElementChild).toHaveClass('bg-primary/10');
  });
});

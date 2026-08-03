import { describe, expect, it } from 'vitest';
import ErrorNotice from '@/components/ErrorNotice';
import { DashboardApiError } from '@/lib/api';
import { render, screen } from '../utils/test-utils';

describe('ErrorNotice', () => {
  it('shows the hint and the documentation link the API sent', () => {
    render(
      <ErrorNotice
        error={
          new DashboardApiError(
            'Forbidden',
            'INSUFFICIENT_SCOPE',
            'Create a new key that includes it.',
            'https://authlane.io/docs/api-reference/authentication'
          )
        }
      />
    );

    expect(screen.getByText('Forbidden')).toBeInTheDocument();
    expect(screen.getByText('Create a new key that includes it.')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://authlane.io/docs/api-reference/authentication'
    );
    expect(screen.getByText('INSUFFICIENT_SCOPE')).toBeInTheDocument();
  });

  it('falls back to a plain message when the failure carries no metadata', () => {
    render(<ErrorNotice error={new Error('Network unreachable')} />);

    expect(screen.getByText('Network unreachable')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorNotice error={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

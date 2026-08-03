import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import ReauthPage from '@/pages/ReauthPage';

const requestMagicLink = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authMode: 'magic-link',
    requestMagicLink,
    user: { email: 'developer@example.com' },
  }),
}));

describe('ReauthPage', () => {
  it('sends a fresh link only to the current user and preserves a safe return path', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/reauth?returnTo=%2Fdashboard%2Fservices']}>
        <ReauthPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Send secure sign-in link' }));

    await waitFor(() =>
      expect(requestMagicLink).toHaveBeenCalledWith('developer@example.com', {
        callbackURL: '/dashboard/services',
        errorCallbackURL: '/reauth?returnTo=%2Fdashboard%2Fservices',
      })
    );
    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
  });
});

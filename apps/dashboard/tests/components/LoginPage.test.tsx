import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/pages/LoginPage';
import { render, screen, waitFor } from '../utils/test-utils';

const login = vi.fn();
const requestMagicLink = vi.fn();
let authMode: 'magic-link' | 'email-password' = 'magic-link';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authMode,
    login,
    requestMagicLink,
    signUpEnabled: true,
  }),
}));

function visit(path: string) {
  window.history.pushState({}, '', path);
}

describe('LoginPage', () => {
  beforeEach(() => {
    authMode = 'magic-link';
    login.mockReset();
    requestMagicLink.mockReset();
    visit('/login');
  });

  it('offers one email-only cloud flow and confirms the inbox step', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email address'), 'developer@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue with email' }));

    await waitFor(() =>
      expect(requestMagicLink).toHaveBeenCalledWith('developer@example.com', {
        callbackURL: '/dashboard',
        newUserCallbackURL: '/onboarding',
        errorCallbackURL: '/login',
      })
    );
    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
  });

  it('preserves password sign-in for self-hosted mode', () => {
    authMode = 'email-password';
    render(<LoginPage />);

    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

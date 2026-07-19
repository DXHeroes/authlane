import { describe, expect, it, vi } from 'vitest';
import SecurityPage from '@/pages/SecurityPage';
import { render, screen } from '../utils/test-utils';

const authMode: 'magic-link' | 'email-password' = 'magic-link';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authMode,
    user: { twoFactorEnabled: false },
  }),
}));

describe('SecurityPage', () => {
  it('does not offer password or TOTP controls in magic-link mode', () => {
    render(<SecurityPage />);

    expect(screen.getByText(/passwordless/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.queryByText('Authenticator app')).not.toBeInTheDocument();
  });
});

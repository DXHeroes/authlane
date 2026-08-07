import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '@/lib/auth-client';
import TwoFactorPage from '@/pages/TwoFactorPage';
import { render, screen, waitFor } from '../utils/test-utils';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
  },
}));

let assign: ReturnType<typeof vi.spyOn>;

async function verify() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Authenticator code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify' }));
}

describe('TwoFactorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    vi.mocked(authClient.twoFactor.verifyTotp).mockResolvedValue({ error: null } as never);
  });

  afterEach(() => {
    assign.mockRestore();
  });

  it('goes to the dashboard for an ordinary sign-in', async () => {
    render(<TwoFactorPage />);

    await verify();

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
  });

  it('stays put when verification fails', async () => {
    vi.mocked(authClient.twoFactor.verifyTotp).mockResolvedValue({
      error: { message: 'Invalid code' },
    } as never);
    render(<TwoFactorPage />);

    await verify();

    expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });
});

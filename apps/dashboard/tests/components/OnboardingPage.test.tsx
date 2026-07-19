import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OnboardingPage from '@/pages/OnboardingPage';
import { render, screen, waitFor } from '../utils/test-utils';

const completeOnboarding = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ completeOnboarding }),
}));

describe('OnboardingPage', () => {
  it('collects personal and organization names separately', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.type(screen.getByLabelText('Your name'), 'Prokop Simek');
    await user.type(screen.getByLabelText('Organization name'), 'DX Heroes');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledWith('Prokop Simek', 'DX Heroes')
    );
  });
});

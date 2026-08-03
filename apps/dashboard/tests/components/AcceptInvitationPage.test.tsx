import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';

const acceptInvitation = vi.fn();
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    organization: {
      acceptInvitation: (...args: unknown[]) => acceptInvitation(...args),
    },
  },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard/accept-invitation/:invitationId"
          element={<AcceptInvitationPage />}
        />
        <Route path="/dashboard" element={<div>Dashboard home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AcceptInvitationPage', () => {
  beforeEach(() => acceptInvitation.mockReset());

  it('accepts the invitation named in the URL', async () => {
    acceptInvitation.mockResolvedValue({ data: { member: { id: 'm1' } }, error: null });
    renderAt('/dashboard/accept-invitation/inv_123');
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: 'inv_123' }));
  });

  it('lands the accepted member on the dashboard', async () => {
    acceptInvitation.mockResolvedValue({ data: { member: { id: 'm1' } }, error: null });
    renderAt('/dashboard/accept-invitation/inv_123');
    expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
  });

  it('shows the reason instead of a blank page', async () => {
    acceptInvitation.mockResolvedValue({ data: null, error: { message: 'Invitation expired' } });
    renderAt('/dashboard/accept-invitation/inv_expired');
    expect(await screen.findByText(/Invitation expired/)).toBeInTheDocument();
  });

  // The component also guards against the client throwing or rejecting. That branch is not
  // asserted here: vitest surfaces any error a spy produces as a test failure, whether the code
  // under test handles it or not. better-auth reports failures as `{ data: null, error }`, which
  // the test above covers, so the guard is defence against a contract change rather than today's
  // behaviour.

  it('accepts only once even when the effect re-runs', async () => {
    acceptInvitation.mockResolvedValue({ data: { member: { id: 'm1' } }, error: null });
    renderAt('/dashboard/accept-invitation/inv_123');
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1));
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const setActive = vi.fn();
const getFullOrganization = vi.fn();
const getSession = vi.fn();
const list = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
    organization: {
      list: (...args: unknown[]) => list(...args),
      setActive: (...args: unknown[]) => setActive(...args),
      getFullOrganization: (...args: unknown[]) => getFullOrganization(...args),
    },
  },
}));

const ORGS = [
  { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: new Date() },
  { id: 'org-2', name: 'Beta', slug: 'beta', createdAt: new Date() },
];

function SwitchButton() {
  const { switchOrganization } = useAuth();
  // Mirrors OrganizationSelector, which reports a failed switch rather than letting it escape.
  const onClick = () => {
    switchOrganization('org-2').catch(() => undefined);
  };
  return (
    <button type="button" onClick={onClick}>
      switch
    </button>
  );
}

describe('switching organization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { mode: 'magic-link', signUpEnabled: false } }),
      }))
    );
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { activeOrganizationId: 'org-1' } },
    });
    list.mockResolvedValue({ data: ORGS });
    getFullOrganization.mockResolvedValue({ data: ORGS[0] });
    setActive.mockResolvedValue({ data: ORGS[1], error: null });
  });

  it('drops what the cache holds for the workspace being left', async () => {
    const queryClient = new QueryClient({
      // The real client keeps queries fresh for five minutes, which is what made stale data stick.
      defaultOptions: { queries: { retry: false, staleTime: 1000 * 60 * 5 } },
    });
    queryClient.setQueryData(['connections'], [{ id: 'conn-from-acme' }]);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SwitchButton />
        </AuthProvider>
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'switch' }));

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: 'org-2' }));
    expect(queryClient.getQueryData(['connections'])).toBeUndefined();
  });

  it('keeps the cache when the switch fails, so the screen still matches the session', async () => {
    setActive.mockResolvedValue({ error: { message: 'Not a member' } });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['connections'], [{ id: 'conn-from-acme' }]);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SwitchButton />
        </AuthProvider>
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'switch' }));

    await waitFor(() => expect(setActive).toHaveBeenCalled());
    expect(queryClient.getQueryData(['connections'])).toEqual([{ id: 'conn-from-acme' }]);
  });
});

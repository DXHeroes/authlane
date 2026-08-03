import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '@/lib/api';
import DashboardHome from '@/pages/DashboardHome';
import { render } from '../utils/test-utils';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

describe('DashboardHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api.get).mockImplementation(async (path) => {
      if (path === '/stats') {
        return {
          totalConnections: 0,
          activeUsers: 0,
          apiCalls7Days: 0,
          services: { enabled: 0, total: 0 },
        };
      }
      if (path === '/connections?limit=10') return [];
      throw new Error(`Unexpected dashboard request: ${path}`);
    });
  });

  it('loads stats relative to the dashboard API base URL', async () => {
    render(<DashboardHome />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(apiModule.api.get).toHaveBeenCalledWith('/stats');
    expect(apiModule.api.get).not.toHaveBeenCalledWith('/dashboard/stats');
  });
});

describe('first run', () => {
  it('sends a workspace with no connections to the sandbox', async () => {
    render(<DashboardHome />);

    const sandbox = await screen.findByRole('link', { name: 'Sandbox' });
    expect(sandbox).toHaveAttribute('href', '/dashboard/sandbox');
    expect(screen.getByRole('link', { name: 'services' })).toHaveAttribute(
      'href',
      '/dashboard/services'
    );
  });
});

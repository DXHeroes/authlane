import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type DashboardApiError } from '@/lib/api';

describe('dashboard API errors', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('preserves the machine-readable code and requests fresh authentication', async () => {
    const listener = vi.fn();
    window.addEventListener('authlane:step-up-required', listener);
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'STEP_UP_REQUIRED',
          message: 'Fresh authentication is required',
          hint: 'Sign in again',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(api.post('/services', {})).rejects.toMatchObject<DashboardApiError>({
      code: 'STEP_UP_REQUIRED',
      message: 'Fresh authentication is required',
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('authlane:step-up-required', listener);
  });
});

import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Stripe Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'sk_test_token_123',
    token_type: 'Bearer',
    scope: 'read_only',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('stripe_list_customers', () => {
    it('has correct tool definition', () => {
      const tool = tools.stripe_list_customers;
      expect(tool.definition.name).toBe('stripe_list_customers');
      expect(tool.definition.description).toContain('Lists customers');
      expect(tool.definition.inputSchema.required).toEqual([]);
    });

    it('lists customers with default parameters', async () => {
      const mockResponse = {
        object: 'list',
        data: [
          { id: 'cus_123', email: 'test@example.com', name: 'Test Customer' },
          { id: 'cus_456', email: 'another@example.com', name: 'Another Customer' },
        ],
        has_more: false,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.stripe_list_customers.handler({}, mockCredentials);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.stripe.com/v1/customers'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_token_123',
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('respects limit parameter', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_customers.handler({ limit: 50 }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('limit=50');
    });

    it('limits maximum to 100', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_customers.handler({ limit: 500 }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('limit=100');
    });

    it('filters by email', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_customers.handler({ email: 'test@example.com' }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('email=test%40example.com');
    });

    it('supports pagination with starting_after', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_customers.handler({ starting_after: 'cus_last123' }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('starting_after=cus_last123');
    });

    it('handles Stripe API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Invalid API key' }),
      } as Response);

      await expect(tools.stripe_list_customers.handler({}, mockCredentials)).rejects.toThrow(
        'Stripe API error: Invalid API key'
      );
    });
  });

  describe('stripe_get_customer', () => {
    it('has correct tool definition', () => {
      const tool = tools.stripe_get_customer;
      expect(tool.definition.name).toBe('stripe_get_customer');
      expect(tool.definition.description).toContain('Retrieves details of a specific customer');
      expect(tool.definition.inputSchema.required).toEqual(['customer_id']);
    });

    it('retrieves customer successfully', async () => {
      const mockCustomer = {
        id: 'cus_123',
        object: 'customer',
        email: 'test@example.com',
        name: 'Test Customer',
        created: 1234567890,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCustomer,
      } as Response);

      const result = await tools.stripe_get_customer.handler(
        { customer_id: 'cus_123' },
        mockCredentials
      );

      expect(result).toEqual(mockCustomer);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/customers/cus_123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_token_123',
          }),
        })
      );
    });

    it('handles customer not found error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'No such customer: cus_invalid' }),
      } as Response);

      await expect(
        tools.stripe_get_customer.handler({ customer_id: 'cus_invalid' }, mockCredentials)
      ).rejects.toThrow('Stripe API error: No such customer: cus_invalid');
    });
  });

  describe('stripe_list_charges', () => {
    it('has correct tool definition', () => {
      const tool = tools.stripe_list_charges;
      expect(tool.definition.name).toBe('stripe_list_charges');
      expect(tool.definition.description).toContain('Lists charges');
      expect(tool.definition.inputSchema.required).toEqual([]);
    });

    it('lists charges with default parameters', async () => {
      const mockResponse = {
        object: 'list',
        data: [
          {
            id: 'ch_123',
            amount: 1000,
            currency: 'usd',
            status: 'succeeded',
          },
          {
            id: 'ch_456',
            amount: 2500,
            currency: 'usd',
            status: 'succeeded',
          },
        ],
        has_more: false,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.stripe_list_charges.handler({}, mockCredentials);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.stripe.com/v1/charges'),
        expect.any(Object)
      );
    });

    it('filters charges by customer', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_charges.handler({ customer: 'cus_123' }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('customer=cus_123');
    });

    it('supports pagination and limit', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_charges.handler(
        {
          limit: 25,
          starting_after: 'ch_last',
        },
        mockCredentials
      );

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('limit=25');
      expect(callUrl).toContain('starting_after=ch_last');
    });

    it('limits maximum to 100', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_charges.handler({ limit: 200 }, mockCredentials);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('limit=100');
    });
  });

  describe('stripe_get_charge', () => {
    it('has correct tool definition', () => {
      const tool = tools.stripe_get_charge;
      expect(tool.definition.name).toBe('stripe_get_charge');
      expect(tool.definition.description).toContain('Retrieves details of a specific charge');
      expect(tool.definition.inputSchema.required).toEqual(['charge_id']);
    });

    it('retrieves charge successfully', async () => {
      const mockCharge = {
        id: 'ch_123',
        object: 'charge',
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
        customer: 'cus_123',
        created: 1234567890,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockCharge,
      } as Response);

      const result = await tools.stripe_get_charge.handler(
        { charge_id: 'ch_123' },
        mockCredentials
      );

      expect(result).toEqual(mockCharge);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/charges/ch_123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_token_123',
          }),
        })
      );
    });

    it('handles charge not found error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'No such charge: ch_invalid' }),
      } as Response);

      await expect(
        tools.stripe_get_charge.handler({ charge_id: 'ch_invalid' }, mockCredentials)
      ).rejects.toThrow('Stripe API error: No such charge: ch_invalid');
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

      await expect(tools.stripe_list_customers.handler({}, mockCredentials)).rejects.toThrow(
        'Network failure'
      );
    });

    it('handles malformed error responses', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      await expect(tools.stripe_list_customers.handler({}, mockCredentials)).rejects.toThrow(
        'Stripe API error: Bad Request'
      );
    });

    it('handles API errors without message field', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Something went wrong' }),
      } as Response);

      await expect(tools.stripe_list_customers.handler({}, mockCredentials)).rejects.toThrow(
        'Stripe API error: Internal Server Error'
      );
    });
  });

  describe('Authentication', () => {
    it('includes OAuth token in all requests', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      const testCases = [
        () => tools.stripe_list_customers.handler({}, mockCredentials),
        () => tools.stripe_get_customer.handler({ customer_id: 'cus_123' }, mockCredentials),
        () => tools.stripe_list_charges.handler({}, mockCredentials),
        () => tools.stripe_get_charge.handler({ charge_id: 'ch_123' }, mockCredentials),
      ];

      for (const testCase of testCases) {
        await testCase();
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer sk_test_token_123',
            }),
          })
        );
        vi.clearAllMocks();
      }
    });

    it('uses correct content type for Stripe API', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'list', data: [] }),
      } as Response);

      await tools.stripe_list_customers.handler({}, mockCredentials);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });
  });
});

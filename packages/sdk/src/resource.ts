import { parseErrorResponse } from './errors.js';
import type { Result } from './types.js';

export class ApiResource {
  constructor(
    protected readonly baseUrl: string,
    protected readonly apiKey: string,
    protected readonly fetchFn: typeof fetch,
    protected readonly timeout: number
  ) {}

  protected async request<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      });
      const json = (await response.json()) as { data: T | null; error: unknown };
      if (!response.ok || json.error) {
        const error =
          json.error && typeof json.error === 'object'
            ? (json.error as Parameters<typeof parseErrorResponse>[0])
            : {};
        return { data: null, error: parseErrorResponse(error) };
      }
      return { data: json.data as T, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Unknown request error',
          code:
            error instanceof Error && error.name === 'AbortError'
              ? 'TIMEOUT_ERROR'
              : 'NETWORK_ERROR',
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

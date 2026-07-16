/** Browser client for this example application's same-origin backend-for-frontend. */

interface Connection {
  serviceId: string;
  status: 'disconnected' | 'pending' | 'connected' | 'expired' | 'error';
  connected: boolean;
  expiresAt: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  errorCode: string | null;
}

interface Service {
  id: string;
  name: string;
  authType: 'oauth2' | 'api_key' | 'none';
  enabled: boolean;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  private: boolean;
}

interface ApiResponse<T> {
  data: T | null;
  error: { message: string; code: string } | null;
}

class ExampleBackendClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`/api/example${endpoint}`, {
        ...options,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...options.headers,
        },
      });
      const body = (await response.json()) as ApiResponse<T>;
      if (!response.ok || body.error) {
        return {
          data: null,
          error: body.error ?? { message: 'Request failed', code: 'UNKNOWN_ERROR' },
        };
      }
      return body;
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Network error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  listServices(): Promise<ApiResponse<Service[]>> {
    return this.request<Service[]>('/services');
  }

  listConnections(): Promise<ApiResponse<Connection[]>> {
    return this.request<Connection[]>('/connections');
  }

  createConnectSession(serviceId: string): Promise<ApiResponse<{ connectUrl: string }>> {
    return this.request<{ connectUrl: string }>(
      `/connect-sessions/${encodeURIComponent(serviceId)}`,
      { method: 'POST' }
    );
  }

  listGitHubRepositories(): Promise<ApiResponse<GitHubRepository[]>> {
    return this.request<GitHubRepository[]>('/github/repositories', { method: 'POST' });
  }
}

export const authlane = new ExampleBackendClient();
export type { ApiResponse, Connection, GitHubRepository, Service };

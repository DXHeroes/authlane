const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1/dashboard';

interface DashboardErrorBody {
  code?: string;
  message?: string;
  hint?: string;
  docUrl?: string;
}

export class DashboardApiError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly docUrl?: string;

  constructor(
    message: string,
    code: string,
    hint?: string,
    docUrl?: string
  ) {
    super(message);
    this.name = 'DashboardApiError';
    this.code = code;
    this.hint = hint;
    this.docUrl = docUrl;
  }
}

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    return headers;
  }

  private async handleResponse<T>(response: Response, method: string): Promise<T> {
    const json = await response.json().catch(() => ({
      error: { message: 'An error occurred' },
      data: null,
    }));

    if (!response.ok || json.error) {
      const error = (json.error || json) as DashboardErrorBody;
      const dashboardError = new DashboardApiError(
        error.message || `HTTP ${response.status}`,
        error.code || 'UNKNOWN_ERROR',
        error.hint,
        error.docUrl
      );
      if (method !== 'GET' && dashboardError.code === 'STEP_UP_REQUIRED') {
        window.dispatchEvent(new CustomEvent('authlane:step-up-required'));
      }
      throw dashboardError;
    }

    // API returns { data, error } format - unwrap the data
    return json.data as T;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies for better-auth session
    });
    return this.handleResponse<T>(response, 'GET');
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include',
    });
    return this.handleResponse<T>(response, 'POST');
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include',
    });
    return this.handleResponse<T>(response, 'PUT');
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: 'include',
    });
    return this.handleResponse<T>(response, 'DELETE');
  }
}

export const api = new ApiClient();

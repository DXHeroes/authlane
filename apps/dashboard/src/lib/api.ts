const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1/dashboard';

interface DashboardErrorBody {
  code?: string;
  message?: string;
  hint?: string;
  docUrl?: string;
}

export interface DashboardStreamFrame {
  event: string;
  data: unknown;
}

export class DashboardApiError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly docUrl?: string;

  constructor(message: string, code: string, hint?: string, docUrl?: string) {
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

  /**
   * Reads a server-sent event response frame by frame. `EventSource` cannot POST and cannot carry
   * the session cookie the dashboard authenticates with, so this drives `fetch` directly.
   */
  async *stream(path: string, data?: unknown): AsyncGenerator<DashboardStreamFrame> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include',
    });

    if (!response.ok || !response.body) {
      await this.handleResponse<unknown>(response, 'POST');
      throw new DashboardApiError('The server did not open a stream.', 'STREAM_UNAVAILABLE');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = parseEventStreamFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (frame) yield frame;
        boundary = buffer.indexOf('\n\n');
      }
    }
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

  async patch<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include',
    });
    return this.handleResponse<T>(response, 'PATCH');
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

function parseEventStreamFrame(frame: string): DashboardStreamFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

export const api = new ApiClient();

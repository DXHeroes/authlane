/**
 * Authlane API Client for Example SaaS
 * 
 * This demonstrates how a SaaS application would integrate with Authlane
 * to manage third-party service connections.
 */

// Configuration - In production, these would come from environment variables
const AUTHLANE_API_URL = 'http://localhost:3000/api/v1'
const AUTHLANE_API_KEY = 'test_api_key_12345' // From Authlane dashboard
const USER_ID = 'demo_user_123' // Your SaaS user's ID

interface Connection {
  id: string
  serviceId: string
  status: 'pending' | 'connected' | 'expired' | 'error'
  connectedAt: string | null
  metadata?: Record<string, unknown>
}

interface Service {
  id: string
  name: string
  authType: 'oauth2' | 'api_key' | 'none'
  enabled: boolean
}

interface Credentials {
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  expiresAt?: string
}

interface ApiResponse<T> {
  data: T | null
  error: { message: string; code: string } | null
}

/**
 * Authlane API client
 */
class AuthlaneClient {
  private baseUrl: string
  private apiKey: string
  private userId: string

  constructor(baseUrl: string, apiKey: string, userId: string) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
    this.userId = userId
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          ...options.headers,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          data: null,
          error: { 
            message: data.error?.message || 'Request failed', 
            code: data.error?.code || 'UNKNOWN_ERROR' 
          },
        }
      }

      return { data: data.data ?? data, error: null }
    } catch (error) {
      return {
        data: null,
        error: { 
          message: error instanceof Error ? error.message : 'Network error', 
          code: 'NETWORK_ERROR' 
        },
      }
    }
  }

  /**
   * List all available services
   */
  async listServices(): Promise<ApiResponse<Service[]>> {
    return this.request<Service[]>('/services')
  }

  /**
   * List user's connections
   */
  async listConnections(): Promise<ApiResponse<Connection[]>> {
    return this.request<Connection[]>(`/users/${this.userId}/connections`)
  }

  /**
   * Get credentials for a specific service
   */
  async getCredentials(serviceId: string): Promise<ApiResponse<Credentials>> {
    return this.request<Credentials>(`/users/${this.userId}/connections/${serviceId}/credentials`)
  }

  /**
   * Check connection health
   */
  async checkHealth(serviceId: string): Promise<ApiResponse<{ healthy: boolean; message: string }>> {
    return this.request<{ healthy: boolean; message: string }>(
      `/users/${this.userId}/connections/${serviceId}/health`
    )
  }

  /**
   * Get OAuth authorization URL
   */
  async getAuthUrl(serviceId: string): Promise<ApiResponse<{ url: string }>> {
    return this.request<{ url: string }>(`/oauth/${serviceId}/authorize?userId=${this.userId}`)
  }

  /**
   * Get widget configuration for embedding
   */
  getWidgetConfig() {
    return {
      apiUrl: this.baseUrl.replace('/api/v1', ''),
      apiKey: this.apiKey,
      userId: this.userId,
    }
  }
}

// Export a singleton instance
export const authlane = new AuthlaneClient(AUTHLANE_API_URL, AUTHLANE_API_KEY, USER_ID)

// Export types
export type { Connection, Service, Credentials, ApiResponse }









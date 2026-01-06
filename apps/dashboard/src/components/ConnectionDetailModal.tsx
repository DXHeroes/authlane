import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { Connection } from '@/types';

interface ConnectionDetailModalProps {
  connection: Connection;
  onClose: () => void;
}

interface ConnectionCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export default function ConnectionDetailModal({ connection, onClose }: ConnectionDetailModalProps) {
  const [showCredentials, setShowCredentials] = useState(false);

  const { data: credentials, isLoading: credentialsLoading } = useQuery({
    queryKey: ['connection-credentials', connection.id],
    queryFn: () =>
      api.get<ConnectionCredentials>(
        `/users/${connection.userId}/connections/${connection.serviceId}/credentials`
      ),
    enabled: showCredentials,
  });

  const maskToken = (token: string) => {
    if (!token) return '';
    if (token.length <= 8) return '••••••••';
    return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
  };

  const getStatusColor = (status: Connection['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'expired':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Connection Details</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Connection ID</label>
            <p className="mt-1 font-mono text-sm">{connection.id}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">User ID</label>
              <p className="mt-1 font-mono text-sm">{connection.userId}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Service</label>
              <p className="mt-1 text-sm">{connection.serviceId}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Status</label>
            <p
              className={`mt-1 text-sm font-semibold uppercase ${getStatusColor(connection.status)}`}
            >
              {connection.status}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created At</label>
              <p className="mt-1 text-sm">{new Date(connection.createdAt).toLocaleString()}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Updated At</label>
              <p className="mt-1 text-sm">{new Date(connection.updatedAt).toLocaleString()}</p>
            </div>
          </div>

          {connection.lastHealthCheck && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Health Check</label>
              <p className="mt-1 text-sm">
                {new Date(connection.lastHealthCheck).toLocaleString()}
              </p>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">Credentials</label>
              <button
                onClick={() => setShowCredentials(!showCredentials)}
                className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {showCredentials ? 'Hide' : 'Show'} Credentials
              </button>
            </div>

            {showCredentials && (
              <div className="rounded-md border border-border bg-muted p-4">
                {credentialsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading credentials...</div>
                ) : credentials ? (
                  <div className="space-y-3">
                    {credentials.accessToken && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Access Token
                        </label>
                        <p className="mt-1 font-mono text-sm break-all">
                          {maskToken(credentials.accessToken)}
                        </p>
                      </div>
                    )}

                    {credentials.refreshToken && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Refresh Token
                        </label>
                        <p className="mt-1 font-mono text-sm break-all">
                          {maskToken(credentials.refreshToken)}
                        </p>
                      </div>
                    )}

                    {credentials.expiresAt && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Expires At
                        </label>
                        <p className="mt-1 text-sm">
                          {new Date(credentials.expiresAt).toLocaleString()}
                        </p>
                      </div>
                    )}

                    {credentials.scopes && credentials.scopes.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Scopes</label>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {credentials.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full bg-primary/10 px-2 py-1 text-xs font-mono"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {credentials.metadata && Object.keys(credentials.metadata).length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Metadata
                        </label>
                        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
                          {JSON.stringify(credentials.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No credentials available</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

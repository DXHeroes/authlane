import type { Connection } from '@/types';

interface ConnectionDetailModalProps {
  connection: Connection;
  onClose: () => void;
}

export default function ConnectionDetailModal({ connection, onClose }: ConnectionDetailModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <button
        type="button"
        aria-label="Dismiss dialog backdrop"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-details-title"
        className="relative w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="connection-details-title" className="text-2xl font-bold">
            Connection Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
            <span className="text-sm font-medium text-muted-foreground">Connection ID</span>
            <p className="mt-1 font-mono text-sm">{connection.id}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-muted-foreground">User ID</span>
              <p className="mt-1 font-mono text-sm">{connection.userId}</p>
            </div>

            <div>
              <span className="text-sm font-medium text-muted-foreground">Service</span>
              <p className="mt-1 text-sm">{connection.serviceId}</p>
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            <p
              className={`mt-1 text-sm font-semibold uppercase ${getStatusColor(connection.status)}`}
            >
              {connection.status}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-muted-foreground">Created At</span>
              <p className="mt-1 text-sm">{new Date(connection.createdAt).toLocaleString()}</p>
            </div>

            <div>
              <span className="text-sm font-medium text-muted-foreground">Updated At</span>
              <p className="mt-1 text-sm">{new Date(connection.updatedAt).toLocaleString()}</p>
            </div>
          </div>

          {connection.lastHealthCheck && (
            <div>
              <span className="text-sm font-medium text-muted-foreground">Last Health Check</span>
              <p className="mt-1 text-sm">
                {new Date(connection.lastHealthCheck).toLocaleString()}
              </p>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Credentials are only issued to scoped server-side API keys and never enter the
              dashboard browser.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
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

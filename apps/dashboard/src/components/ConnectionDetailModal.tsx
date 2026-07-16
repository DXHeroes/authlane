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
            <p className="text-sm text-muted-foreground">
              Credentials are only issued to scoped server-side API keys and never enter the
              dashboard browser.
            </p>
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

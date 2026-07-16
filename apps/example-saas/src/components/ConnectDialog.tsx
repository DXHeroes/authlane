import { AuthlaneConnect, type AuthlaneConnectEvent } from '@authlane/react';

interface ConnectDialogProps {
  connectUrl: string;
  serviceName: string;
  onClose: () => void;
  onConnected: () => void | Promise<void>;
  onError?: (message: string) => void;
}

export default function ConnectDialog({
  connectUrl,
  serviceName,
  onClose,
  onConnected,
  onError,
}: ConnectDialogProps) {
  async function handleEvent(event: AuthlaneConnectEvent) {
    if (event.type === 'connected') {
      onClose();
      await onConnected();
    } else if (event.type === 'error') {
      onError?.(event.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${serviceName}`}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Secure connection
            </p>
            <h2 className="text-lg font-semibold text-gray-950">Connect {serviceName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            aria-label="Close connection dialog"
          >
            Close
          </button>
        </div>
        <AuthlaneConnect
          connectUrl={connectUrl}
          title={`Authlane connection for ${serviceName}`}
          minHeight={520}
          onEvent={handleEvent}
        />
      </div>
    </div>
  );
}

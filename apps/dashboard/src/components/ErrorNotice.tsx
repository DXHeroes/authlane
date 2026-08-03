import { DashboardApiError } from '@/lib/api';

/**
 * Shows an API failure with everything the API said about it.
 *
 * The control plane answers a failure with a message, a machine-readable code, a hint naming the
 * fix and a link to the page that explains it. The dashboard used to print the message alone and
 * drop the rest, which is the half that tells someone what to do next.
 */
export default function ErrorNotice({
  error,
  className = '',
}: {
  error: unknown;
  className?: string;
}) {
  if (!error) return null;

  const apiError = error instanceof DashboardApiError ? error : null;
  const message =
    apiError?.message ?? (error instanceof Error ? error.message : 'Something went wrong.');

  return (
    <div
      role="alert"
      className={`rounded-md border border-red-500 bg-red-50 p-3 text-sm text-red-700 ${className}`}
    >
      <p className="font-medium">{message}</p>
      {apiError?.hint && <p className="mt-1 text-red-600">{apiError.hint}</p>}
      {apiError?.docUrl && (
        <a
          href={apiError.docUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block underline hover:no-underline"
        >
          Read the documentation for this error
        </a>
      )}
      {apiError?.code && <p className="mt-2 font-mono text-xs text-red-500">{apiError.code}</p>}
    </div>
  );
}

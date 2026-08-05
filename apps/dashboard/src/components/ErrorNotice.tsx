import { DashboardApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';

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
  const message = errorMessage(error);

  return (
    <div
      role="alert"
      className={cn(
        // Literal red-50/red-700 had no dark counterpart, so the notice stayed a pale
        // wash on a near-black card. The destructive token carries both themes.
        'rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive',
        className
      )}
    >
      <p className="font-medium">{message}</p>
      {apiError?.hint && <p className="mt-1 text-destructive/90">{apiError.hint}</p>}
      {apiError?.docUrl && (
        <a
          href={apiError.docUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block underline underline-offset-4 hover:no-underline"
        >
          Read the documentation for this error
        </a>
      )}
      {apiError?.code && (
        <p className="mt-2 font-mono text-xs text-destructive/80">{apiError.code}</p>
      )}
    </div>
  );
}

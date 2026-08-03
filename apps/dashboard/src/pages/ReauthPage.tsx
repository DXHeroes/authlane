import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { safeDashboardReturnPath } from '@/lib/auth-helpers';

export default function ReauthPage() {
  const { authMode, logout, requestMagicLink, user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const returnTo = safeDashboardReturnPath(params.get('returnTo'));

  if (!user) return <Navigate to="/login" replace />;

  const continueWithMagicLink = async () => {
    setError('');
    setIsLoading(true);
    try {
      await requestMagicLink(user.email, {
        callbackURL: returnTo,
        errorCallbackURL: `/reauth?returnTo=${encodeURIComponent(returnTo)}`,
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send a secure sign-in link');
    } finally {
      setIsLoading(false);
    }
  };

  const continueWithPassword = async () => {
    await logout();
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Confirm it&apos;s you</h1>
        <p className="text-sm text-muted-foreground">
          Sensitive changes require a sign-in from the last ten minutes. Your original action was
          not repeated.
        </p>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {sent && (
          <output className="block rounded-md bg-primary/10 p-4 text-sm">
            <strong>Check your inbox.</strong> Open the new link, then repeat the change yourself.
          </output>
        )}
        {authMode === 'magic-link' ? (
          <button
            type="button"
            disabled={isLoading || sent}
            onClick={continueWithMagicLink}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send secure sign-in link'}
          </button>
        ) : (
          <button
            type="button"
            onClick={continueWithPassword}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Sign in again
          </button>
        )}
      </div>
    </main>
  );
}

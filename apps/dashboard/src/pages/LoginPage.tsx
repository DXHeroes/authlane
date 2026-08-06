import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import Button from '@/components/ui/Button';
import Callout from '@/components/ui/Callout';
import { TextField } from '@/components/ui/Field';
import { useAuth } from '@/contexts/AuthContext';
import { magicLinkErrorMessage } from '@/lib/auth-helpers';
import {
  authorizeUrl,
  clearParkedRequest,
  consentUrl,
  parksAnAuthorization,
  pendingAuthorizeQuery,
  pendingConsentQuery,
  stashParkedRequest,
} from '@/lib/oauth-flow';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState(() => magicLinkErrorMessage(searchParams.get('error')));
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { authMode, isAuthenticated, login, requestMagicLink, signUpEnabled } = useAuth();

  /**
   * The authorization request that sent the browser here, if any.
   *
   * Read from the raw search string rather than `searchParams`, which would re-encode every value
   * on the way back out. See lib/oauth-flow.ts.
   */
  const authorizeQuery = pendingAuthorizeQuery(location.search);
  const consentQuery = pendingConsentQuery(location.search);
  /** Every way this page can be standing inside somebody else's sign-in. */
  const isOAuthEntry = parksAnAuthorization(location.search);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  /**
   * Keeps a parked request alive across a two-factor detour.
   *
   * Verification happens on /two-factor, which never sees this query. Stashing it here is what lets
   * that page finish the flow instead of dropping the user on the dashboard.
   *
   * The `else` is the important half. Without it an abandoned OAuth attempt would sit in session
   * storage for its full ten minutes, and the next person to sign in through two-factor **in this
   * tab** — a shared machine, a handed-over laptop — would be carried into a stranger's pending
   * authorization and could grant an application they never asked for. Reaching the login page with
   * no request parked on it means any stored one is stale by definition, so it goes.
   */
  useEffect(() => {
    if (authorizeQuery) stashParkedRequest('authorize', authorizeQuery);
    else if (consentQuery) stashParkedRequest('consent', consentQuery);
    else clearParkedRequest();
  }, [authorizeQuery, consentQuery]);

  /**
   * Hands a parked request back the moment a session exists.
   *
   * Driven by `isAuthenticated` rather than by the submit handler so it covers both ways a session
   * appears: the password sign-in that just happened here, and arriving with one already (a second
   * tab, or the back button). It deliberately does not fire when `login` returns without a session,
   * which is how two-factor keeps its own redirect to /two-factor — and the stash above is what
   * carries the request the rest of the way.
   *
   * The authorization endpoint gets a full-page navigation because it is the API, and it answers a
   * `fetch` with a JSON body describing a redirect rather than one the browser follows. The consent
   * screen is this same app, so it gets the router.
   *
   * A re-authentication prompt (`prompt=login`) has neither branch: its query cannot be replayed,
   * and the plugin's `after` hook resumes it from the cookie on the sign-in response.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    if (authorizeQuery) {
      clearParkedRequest();
      window.location.assign(authorizeUrl(authorizeQuery));
      return;
    }
    if (consentQuery) {
      clearParkedRequest();
      navigate(consentUrl(consentQuery), { replace: true });
    }
  }, [authorizeQuery, consentQuery, isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (authMode === 'magic-link') {
        /**
         * The email hop is the one path the plugin's own resume cannot cover: it restores a parked
         * request from a cookie, and a link opened on a different device — or after the cookie's ten
         * minutes — has none. Carrying the query in `callbackURL` puts the flow in the link itself.
         *
         * On the authorization branch a first-time user is sent to the same place rather than to
         * onboarding: they will not be a member of the client's workspace, so the endpoint answers
         * `access_denied` and the application that asked finds out, where onboarding would strand it
         * waiting forever.
         *
         * The consent branch does the opposite, and deliberately. A consent code is bound to the
         * user it was minted for, and the plugin records the grant against *that* user rather than
         * whoever is signed in when it is redeemed — so handing the screen to a brand-new account
         * would let a different person complete somebody else's consent. New users go to onboarding.
         */
        await requestMagicLink(
          email,
          authorizeQuery
            ? {
                callbackURL: authorizeUrl(authorizeQuery),
                newUserCallbackURL: authorizeUrl(authorizeQuery),
                // Keeps the request on the page, so an expired link can be retried in the flow.
                errorCallbackURL: `/login?${authorizeQuery}`,
              }
            : consentQuery
              ? {
                  callbackURL: consentUrl(consentQuery),
                  newUserCallbackURL: '/onboarding',
                  errorCallbackURL: `/login?${consentQuery}`,
                }
              : {
                  callbackURL: '/dashboard',
                  newUserCallbackURL: '/onboarding',
                  errorCallbackURL: '/login',
                }
        );
        setSent(true);
        setCooldown(30);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Authlane</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {/* Says why the sign-in is being asked for, when something else asked for it. */}
            {isOAuthEntry
              ? 'Sign in to continue to the application that sent you here'
              : authMode === 'magic-link'
                ? signUpEnabled
                  ? 'Sign in or create your account'
                  : 'Sign in to your dashboard'
                : 'Sign in to your dashboard'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && <Callout tone="danger">{error}</Callout>}
          {sent && (
            <output className="block rounded-md bg-primary/10 p-4 text-sm">
              <strong>Check your inbox.</strong> We sent a secure sign-in link. It expires in ten
              minutes and can be used once.
            </output>
          )}

          <div className="space-y-4">
            <TextField
              id="email"
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              required
              // The one field on the page. Making someone reach for the mouse first is
              // a step for nothing.
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {authMode === 'email-password' && (
              <TextField
                id="password"
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </div>

          <Button type="submit" className="w-full" isPending={isLoading} disabled={cooldown > 0}>
            {isLoading
              ? 'Sending...'
              : authMode === 'magic-link'
                ? cooldown > 0
                  ? `Send again in ${cooldown}s`
                  : 'Continue with email'
                : 'Sign in'}
          </Button>

          {authMode === 'email-password' && signUpEnabled && (
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

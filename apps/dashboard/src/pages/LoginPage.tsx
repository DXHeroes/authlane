import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import Button from '@/components/ui/Button';
import Callout from '@/components/ui/Callout';
import { TextField } from '@/components/ui/Field';
import { useAuth } from '@/contexts/AuthContext';
import { magicLinkErrorMessage } from '@/lib/auth-helpers';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(() => magicLinkErrorMessage(searchParams.get('error')));
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { authMode, login, requestMagicLink, signUpEnabled } = useAuth();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (authMode === 'magic-link') {
        await requestMagicLink(email, {
          callbackURL: '/dashboard',
          newUserCallbackURL: '/onboarding',
          errorCallbackURL: '/login',
        });
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
            {authMode === 'magic-link'
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

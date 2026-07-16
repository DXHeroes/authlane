import { type FormEvent, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth-client';

interface Enrollment {
  totpURI: string;
  backupCodes: string[];
}

export default function SecurityPage() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const enable = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.enable({ password });
      if (result.error || !result.data) {
        throw new Error(result.error?.message || 'Could not start two-factor enrollment');
      }
      setEnrollment(result.data);
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start enrollment');
    } finally {
      setIsLoading(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error) throw new Error(result.error.message || 'Invalid authenticator code');
      setEnrollment(null);
      setCode('');
      setMessage('Two-factor authentication is enabled. Sign in again before sensitive changes.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const disable = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error)
        throw new Error(result.error.message || 'Could not disable two-factor authentication');
      setPassword('');
      setMessage('Two-factor authentication is disabled.');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not disable two-factor authentication'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Account security</h1>
        <p className="mt-2 text-muted-foreground">
          Sensitive dashboard changes require TOTP and a sign-in from the last ten minutes.
        </p>
      </div>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {message && <div className="rounded-md bg-primary/10 p-3 text-sm">{message}</div>}

      {enrollment ? (
        <section className="space-y-4 rounded-lg border p-6">
          <h2 className="text-xl font-semibold">Finish authenticator setup</h2>
          <p className="text-sm">Import this URI into your authenticator application:</p>
          <code className="block break-all rounded bg-muted p-3 text-xs">{enrollment.totpURI}</code>
          <div>
            <h3 className="font-medium">Recovery codes</h3>
            <p className="text-sm text-muted-foreground">
              Store these offline. Each code works once.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-2 rounded bg-muted p-3 font-mono text-sm">
              {enrollment.backupCodes.map((backupCode) => (
                <li key={backupCode}>{backupCode}</li>
              ))}
            </ul>
          </div>
          <form onSubmit={verify} className="space-y-3">
            <label htmlFor="enrollment-code" className="block text-sm font-medium">
              Authenticator code
            </label>
            <input
              id="enrollment-code"
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              className="block w-full rounded-md border border-input bg-background px-3 py-2"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              Verify and enable
            </button>
          </form>
        </section>
      ) : (
        <section className="space-y-4 rounded-lg border p-6">
          <div>
            <h2 className="text-xl font-semibold">Authenticator app</h2>
            <p className="text-sm text-muted-foreground">
              Status: {user?.twoFactorEnabled ? 'enabled' : 'not enrolled'}
            </p>
          </div>
          <form onSubmit={user?.twoFactorEnabled ? disable : enable} className="space-y-3">
            <label htmlFor="security-password" className="block text-sm font-medium">
              Current password
            </label>
            <input
              id="security-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="block w-full rounded-md border border-input bg-background px-3 py-2"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {user?.twoFactorEnabled
                ? 'Disable two-factor authentication'
                : 'Set up two-factor authentication'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

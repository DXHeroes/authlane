import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function TwoFactorPage() {
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error) throw new Error(result.error.message || 'Verification failed');
      window.location.assign('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 rounded-lg border p-6">
        <div>
          <h1 className="text-2xl font-bold">Two-factor verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter a code from your authenticator or use one recovery code.
          </p>
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div>
          <label htmlFor="two-factor-code" className="block text-sm font-medium">
            {useBackupCode ? 'Recovery code' : 'Authenticator code'}
          </label>
          <input
            id="two-factor-code"
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
            autoComplete="one-time-code"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            required
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {isLoading ? 'Verifying...' : 'Verify'}
        </button>
        <button
          type="button"
          onClick={() => {
            setCode('');
            setError('');
            setUseBackupCode((value) => !value);
          }}
          className="w-full text-sm text-primary hover:underline"
        >
          {useBackupCode ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
      </form>
    </div>
  );
}

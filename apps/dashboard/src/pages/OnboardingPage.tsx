import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '@/components/ui/Button';
import Callout from '@/components/ui/Callout';
import { TextField } from '@/components/ui/Field';
import { useAuth } from '@/contexts/AuthContext';

export default function OnboardingPage() {
  const { completeOnboarding, user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await completeOnboarding(name.trim(), organizationName.trim());
      navigate('/dashboard', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not finish setup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Set up your workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One last step before you connect your first service.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-5">
          {error && <Callout tone="danger">{error}</Callout>}
          <TextField
            id="personal-name"
            label="Your name"
            autoComplete="name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            id="organization-name"
            label="Organization name"
            autoComplete="organization"
            required
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
          <Button type="submit" className="w-full" isPending={isLoading}>
            {isLoading ? 'Creating workspace...' : 'Create workspace'}
          </Button>
        </form>
      </div>
    </main>
  );
}

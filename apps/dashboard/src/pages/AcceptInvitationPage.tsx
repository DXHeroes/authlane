import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authClient } from '@/lib/auth-client';

type State = { status: 'working' } | { status: 'failed'; message: string };

const GENERIC_FAILURE = 'Could not accept the invitation';

/**
 * Receives the link sent in an invitation email. The API builds that link with
 * `buildInvitationLink` (apps/api/src/lib/app-url.ts); the two must agree on this path.
 */
export default function AcceptInvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !invitationId) return;
    started.current = true;

    void (async () => {
      try {
        const result: { error?: { message?: string } | null } =
          await authClient.organization.acceptInvitation({ invitationId });
        if (result?.error) {
          setState({ status: 'failed', message: result.error.message ?? GENERIC_FAILURE });
          return;
        }
        navigate('/dashboard', { replace: true });
      } catch {
        setState({ status: 'failed', message: GENERIC_FAILURE });
      }
    })();
  }, [invitationId, navigate]);

  if (state.status === 'failed') {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Invitation not accepted</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <p className="mt-4 text-sm">Ask whoever invited you to send a new invitation.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
    </div>
  );
}

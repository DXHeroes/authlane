import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import ErrorNotice from '@/components/ErrorNotice';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { isNavigableUrl } from '@/lib/oauth-flow';
import type { OAuthClient } from '@/types';

/**
 * The screen that asks whether a downstream application may read this user's Authlane identity.
 *
 * better-auth's oidc-provider sends the browser here (`consentPage` in
 * apps/api/src/lib/oidc-provider-config.ts) with `consent_code`, `client_id` and `scope`, having
 * already checked the session, the client and the redirect URI. What is left is to say plainly what
 * is about to be shared and to relay the answer.
 *
 * EVERY STRING ON THIS PAGE THAT CAME FROM THE SERVER IS RENDERED AS TEXT. A client's name is
 * whatever the workspace that registered it typed, so it is attacker-controlled in the case this
 * page exists to protect against: an application claiming to be a different application. React
 * escapes interpolated children, which is why there is no `dangerouslySetInnerHTML` here and why
 * the icon is only rendered once its URL is known to be http(s).
 *
 * ASSUMPTION WORTH REVISITING: the scopes displayed come from the `scope` query parameter, while
 * the grant is recorded against `consent_code` alone — the server never checks that the two agree,
 * so the list shown and the permission stored are independent. This is not reachable today, because
 * producing the page at all takes a valid consent code already bound to the victim's own session
 * and issued from the query the plugin itself wrote. It stops being safe the moment a consent code
 * can be moved between requests or users, so revisit this if consent codes ever become
 * transferable. Fixing it properly means the server returning the scope alongside the consent code
 * rather than the browser carrying it.
 */

/**
 * What each OIDC scope actually discloses, in the words of the person being asked.
 *
 * Only the scopes Authlane grants are listed; anything else is shown by name rather than dropped,
 * because a scope nobody can describe is exactly the one worth putting in front of the user.
 */
const SCOPE_DISCLOSURES: Record<string, string> = {
  openid: 'Your Authlane user ID',
  profile: 'Your name',
  email: 'Your email address',
};

/**
 * The list of what this authorization discloses, derived from the scopes actually requested.
 *
 * The workspace line is unconditional because the claim is: `createWorkspaceClaimResolver`
 * (apps/api/src/lib/oauth-workspace-claims.ts) attaches the workspace id, slug and the user's role
 * in it to every token Authlane issues, whatever scopes were asked for. Hanging it off a scope
 * would describe a rule that does not exist.
 */
export function disclosuresForScope(scope: string): string[] {
  const requested = scope.split(/[\s+]+/).filter(Boolean);
  const disclosures = new Set<string>();

  for (const value of requested) {
    disclosures.add(SCOPE_DISCLOSURES[value] ?? `The “${value}” scope`);
  }
  disclosures.add('Which Authlane workspace you belong to, and your role in it');

  return [...disclosures];
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="heading-tight text-2xl font-semibold tracking-tight">Authlane</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const { organization } = useAuth();
  const [failure, setFailure] = useState<unknown>(null);

  const consentCode = searchParams.get('consent_code');
  const clientId = searchParams.get('client_id');
  const scope = searchParams.get('scope') ?? '';

  const hasRequest = Boolean(consentCode && clientId);

  /**
   * The client's display identity, read from the plugin's own session-protected endpoint. This
   * lives under `/api/auth`, not the dashboard API, so it answers with a bare object rather than
   * the `{ data, error }` envelope `lib/api.ts` unwraps.
   */
  const clientQuery = useQuery({
    queryKey: ['oauth-consent-client', clientId],
    enabled: hasRequest,
    retry: false,
    queryFn: async () => {
      const response = await fetch(
        `/api/auth/oauth2/client/${encodeURIComponent(clientId as string)}`,
        { credentials: 'include', headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'This application is not registered with Authlane.'
            : 'Could not load the application requesting access.'
        );
      }
      return (await response.json()) as { clientId: string; name: string; icon: string | null };
    },
  });

  /**
   * Which workspace this consent belongs to.
   *
   * The token's workspace claim resolves against the organization that owns the *client*, which is
   * not necessarily the one the user currently has active. Naming the active workspace would
   * therefore be a guess, and a wrong guess on a consent screen is a misrepresentation of what the
   * user is agreeing to. The client list is scoped to the active organization, so finding this
   * client in it is proof the two are the same; not finding it means the name stays unspoken.
   */
  const clientsQuery = useQuery({
    queryKey: ['oauth-clients'],
    enabled: hasRequest,
    retry: false,
    queryFn: () => api.get<OAuthClient[]>('/oauth-clients'),
  });
  const workspaceName = clientsQuery.data?.some((client) => client.clientId === clientId)
    ? organization?.name
    : undefined;

  const decide = useMutation({
    mutationFn: async (accept: boolean) => {
      const response = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      const body = (await response.json().catch(() => null)) as { redirectURI?: unknown } | null;

      if (!response.ok) {
        throw new Error(
          'Authlane could not complete this request. It may have expired — start again from the application.'
        );
      }
      const redirectUri = typeof body?.redirectURI === 'string' ? body.redirectURI : null;
      if (!redirectUri || !isNavigableUrl(redirectUri)) {
        throw new Error(
          'Authlane did not return a destination for this request. Start again from the application.'
        );
      }
      return redirectUri;
    },
    // A full-page navigation, not the router: the destination belongs to the application that
    // asked, and it is the browser's trip back out of Authlane.
    onSuccess: (redirectUri) => window.location.assign(redirectUri),
    onError: (error) => setFailure(error),
  });

  if (!hasRequest) {
    return (
      <ConsentShell>
        <Card className="p-6 text-center">
          <h2 className="heading-tight font-semibold">Nothing to authorize</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is part of signing in to another application. Open it from that application
            rather than directly.
          </p>
          <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">
            Go to your dashboard
          </Link>
        </Card>
      </ConsentShell>
    );
  }

  if (clientQuery.isLoading) {
    return (
      <ConsentShell>
        <Card className="flex items-center justify-center gap-3 p-8 text-muted-foreground">
          <Spinner className="size-5" />
          <span role="status">Loading the authorization request</span>
        </Card>
      </ConsentShell>
    );
  }

  if (clientQuery.isError || !clientQuery.data) {
    return (
      <ConsentShell>
        <Card className="p-6">
          <h2 className="heading-tight font-semibold">This request cannot be shown</h2>
          <div className="mt-3">
            <ErrorNotice error={clientQuery.error} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing has been shared. Start again from the application you were signing in to.
          </p>
        </Card>
      </ConsentShell>
    );
  }

  const client = clientQuery.data;
  const iconUrl = client.icon && isNavigableUrl(client.icon) ? client.icon : null;

  return (
    <ConsentShell>
      <Card className="p-6">
        <div className="flex items-start gap-3">
          {iconUrl && (
            <img
              src={iconUrl}
              alt=""
              className="size-10 shrink-0 rounded-md border border-border object-cover"
            />
          )}
          <div className="min-w-0">
            <h2 className="heading-tight text-lg font-semibold">
              <span className="break-words">{client.name}</span> wants to access your Authlane
              account
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspaceName ? (
                <>
                  You are signing in to the workspace{' '}
                  <span className="font-medium text-foreground">{workspaceName}</span>.
                </>
              ) : (
                'You are signing in with your Authlane workspace.'
              )}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium">This will share</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {disclosuresForScope(scope).map((disclosure) => (
              <li key={disclosure} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span className="min-w-0 break-words">{disclosure}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Authlane never shares the credentials you have connected to your services. You can remove
          this application from your workspace at any time.
        </p>

        {failure ? (
          <div className="mt-4">
            <ErrorNotice error={failure} />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setFailure(null);
              decide.mutate(false);
            }}
            disabled={decide.isPending}
          >
            Deny
          </Button>
          <Button
            onClick={() => {
              setFailure(null);
              decide.mutate(true);
            }}
            isPending={decide.isPending}
          >
            {decide.isPending ? 'Authorizing…' : 'Allow access'}
          </Button>
        </div>
      </Card>
    </ConsentShell>
  );
}

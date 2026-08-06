import { CheckIcon } from '@heroicons/react/16/solid';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import ErrorNotice from '@/components/ErrorNotice';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import type { OAuthClient, OAuthClientWithSecret } from '@/types';
import Button from './ui/Button';
import Dialog from './ui/Dialog';
import { controlClassName, TextField } from './ui/Field';

/**
 * Registers a connected application, or edits one that exists.
 *
 * Registration ends on a second screen holding the client secret. That screen is the only place the
 * secret is ever readable: the API seals it on the way into the database and no endpoint returns it
 * again, so a workspace that closes the dialog without copying it has to register a new client. The
 * warning says so in the strongest terms the screen has, which is the same weight CreateApiKeyModal
 * gives the identical moment — closing stays as easy as it is anywhere else in the dashboard rather
 * than becoming a trap that only one button can escape.
 */

/**
 * Turns the textarea into the array the API expects.
 *
 * One URI per line rather than comma-separated on purpose: `oauth_application.redirect_urls` is
 * itself a comma-joined column, so the API rejects any URI containing a comma. A newline cannot
 * collide with the storage format, which keeps the separator out of the user's way entirely.
 */
export function parseRedirectUris(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

interface OAuthClientModalProps {
  /** The client being edited. Absent registers a new one. */
  client?: OAuthClient;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OAuthClientModal({ client, onClose, onSuccess }: OAuthClientModalProps) {
  const [name, setName] = useState(client?.name ?? '');
  const [redirectUris, setRedirectUris] = useState((client?.redirectUris ?? []).join('\n'));
  const [created, setCreated] = useState<OAuthClientWithSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const formId = useId();
  const redirectFieldId = useId();

  const isEditing = Boolean(client);

  const save = useMutation({
    mutationFn: (payload: { name: string; redirectUris: string[] }) =>
      client
        ? api.patch<OAuthClient>(`/oauth-clients/${client.id}`, payload)
        : api.post<OAuthClientWithSecret>('/oauth-clients', payload),
    onSuccess: (data) => {
      if (isEditing) {
        toastSuccess(`${data.name} updated`);
        onSuccess();
        onClose();
        return;
      }
      setCreated(data as OAuthClientWithSecret);
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    save.mutate({ name: trimmed, redirectUris: parseRedirectUris(redirectUris) });
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.clientSecret);
      setCopied(true);
      toastSuccess('Client secret copied to your clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toastError(error, 'Could not reach the clipboard. Select the secret and copy it manually.');
    }
  };

  const handleClose = () => {
    if (created) onSuccess();
    onClose();
  };

  if (created) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        title="Application registered"
        size="sm"
        footer={<Button onClick={handleClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
            <p className="mb-1 text-sm font-semibold text-warning">Copy the client secret now</p>
            <p className="text-sm text-warning/90">
              This is the only time it can be shown. Authlane stores it sealed and cannot return it
              again — losing it means registering the application from scratch.
            </p>
          </div>

          <div>
            <label htmlFor="created-client-id" className="mb-1.5 block text-sm font-medium">
              Client ID
            </label>
            <input
              id="created-client-id"
              type="text"
              value={created.clientId}
              readOnly
              className="w-full min-w-0 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <label htmlFor="created-client-secret" className="mb-1.5 block text-sm font-medium">
              Client secret
            </label>
            <div className="flex gap-2">
              <input
                id="created-client-secret"
                type="text"
                value={created.clientSecret}
                readOnly
                className="min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
              />
              <Button onClick={handleCopy} icon={copied ? <CheckIcon className="size-4" /> : null}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title={isEditing ? `Edit ${client?.name}` : 'Register an application'}
      description={
        isEditing
          ? 'Changing the redirect URIs takes effect on the next sign-in.'
          : 'An application that signs users in with their Authlane workspace.'
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            isPending={save.isPending}
            disabled={!name.trim() || parseRedirectUris(redirectUris).length === 0}
          >
            {isEditing ? 'Save changes' : 'Register application'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="oauth-client-name"
          label="Application name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. SmartStaff"
          required
          hint="Shown to your users on the screen that asks them to authorize it."
        />

        <div className="min-w-0">
          <label htmlFor={redirectFieldId} className="block text-sm font-medium">
            Redirect URIs
          </label>
          <textarea
            id={redirectFieldId}
            value={redirectUris}
            onChange={(event) => setRedirectUris(event.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={'https://app.example.com/auth/authlane/callback'}
            aria-describedby={`${redirectFieldId}-hint`}
            className={`${controlClassName} mt-1.5 font-mono text-xs`}
          />
          <p id={`${redirectFieldId}-hint`} className="mt-1.5 text-xs text-muted-foreground">
            One per line, up to ten. Each must be an absolute https URL with no fragment and no
            wildcard — matching is exact, so the URI here has to be the one the application sends.
            http is accepted on localhost outside production.
          </p>
        </div>

        {save.isError && <ErrorNotice error={save.error} />}
      </form>
    </Dialog>
  );
}

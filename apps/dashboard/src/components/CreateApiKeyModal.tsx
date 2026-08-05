import { API_SCOPES, type ApiScope, DEFAULT_API_SCOPES } from '@authlane/shared/api-scopes';
import { CheckIcon } from '@heroicons/react/16/solid';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import ErrorNotice from '@/components/ErrorNotice';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import type { ApiKeyWithSecret } from '@/types';
import Button from './ui/Button';
import Dialog from './ui/Dialog';
import { TextField } from './ui/Field';

interface CreateApiKeyModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const scopeOptions: Record<ApiScope, { label: string; description: string }> = {
  'catalog:read': {
    label: 'Read service catalog',
    description: 'List services and their tool definitions.',
  },
  'connections:read': {
    label: 'Read connections',
    description: 'Read connection status for end users.',
  },
  'credentials:issue': {
    label: 'Issue credential leases',
    description: 'Retrieve short-lived credentials for direct provider calls.',
  },
  'connect-sessions:create': {
    label: 'Create connect sessions',
    description: 'Create hosted connection flows for end users.',
  },
};

export default function CreateApiKeyModal({ onClose, onSuccess }: CreateApiKeyModalProps) {
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [scopes, setScopes] = useState<ApiScope[]>([...DEFAULT_API_SCOPES]);
  const [createdKey, setCreatedKey] = useState<ApiKeyWithSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const formId = useId();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; expiresInDays?: number; scopes: ApiScope[] }) =>
      api.post<ApiKeyWithSecret>('/api-keys', data),
    onSuccess: (data) => {
      setCreatedKey(data);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createMutation.mutate({
      name: name.trim(),
      expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
      scopes,
    });
  };

  const toggleScope = (scope: ApiScope) => {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : API_SCOPES.filter((item) => current.includes(item) || item === scope)
    );
  };

  const handleCopy = async () => {
    if (!createdKey) return;

    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      toastSuccess('API key copied to your clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toastError(err, 'Could not reach the clipboard. Select the key and copy it manually.');
    }
  };

  const handleClose = () => {
    if (createdKey) {
      onSuccess();
    }
    onClose();
  };

  if (createdKey) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        title="API Key Created"
        size="sm"
        footer={<Button onClick={handleClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
            <p className="mb-1 text-sm font-semibold text-warning">
              Important: Save this API key now!
            </p>
            <p className="text-sm text-warning/90">
              This is the only time you will see this key. Store it securely.
            </p>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">API Key Name</span>
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              {createdKey.name}
            </p>
          </div>

          <div>
            <label htmlFor="created-api-key" className="mb-1.5 block text-sm font-medium">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                id="created-api-key"
                type="text"
                value={createdKey.key}
                readOnly
                className="min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
              />
              <Button onClick={handleCopy} icon={copied ? <CheckIcon className="size-4" /> : null}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {createdKey.expiresAt && (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Expires At</span>
              <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {new Date(createdKey.expiresAt).toLocaleString()}
              </p>
            </div>
          )}
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
      title="Create API Key"
      description="Permissions are fixed once the key exists."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            isPending={createMutation.isPending}
            disabled={!name.trim()}
          >
            {createMutation.isPending ? 'Creating...' : 'Create API Key'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="key-name"
          label="API Key Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Production API Key"
          required
          hint="A descriptive name to help you identify this key"
        />

        <TextField
          id="expires-in"
          label="Expires In (Days)"
          type="number"
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="Leave empty for no expiration"
          min="1"
          hint="Optional: Set an expiration date for this key"
        />

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Permissions</legend>
          <div className="space-y-2 rounded-md border border-border p-3">
            {API_SCOPES.map((scope) => {
              const option = scopeOptions[scope];
              return (
                <label key={scope} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {scopes.includes('credentials:issue') ? (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              This key can retrieve short-lived credentials. Treat it as a high-privilege secret.
            </p>
          ) : (
            // Without this scope every tool call fails at run time, long after the key looked
            // fine: listing tools succeeds, and only the model's first invocation gets a 403.
            <p className="mt-2 rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">
              Without <strong>Issue credential leases</strong> this key can read the catalog and
              start connections, but no tool will run: the first call an agent makes returns 403. A
              key's permissions are fixed once created.
            </p>
          )}
        </fieldset>

        {createMutation.isError && <ErrorNotice error={createMutation.error} />}
      </form>
    </Dialog>
  );
}

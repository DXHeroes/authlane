import { useId, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { toastSuccess } from '@/lib/toast';
import ErrorNotice from './ErrorNotice';
import Button from './ui/Button';
import Dialog from './ui/Dialog';
import { SelectField, TextField } from './ui/Field';

interface InviteMemberModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteMemberModal({ onClose, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await authClient.organization.inviteMember({
        email: email.trim(),
        role,
      });
      setSuccess(true);
      toastSuccess(`Invitation sent to ${email.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const close = (open: boolean) => {
    if (!open) onClose();
  };

  if (success) {
    return (
      <Dialog
        open
        onOpenChange={close}
        title="Invitation Sent"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEmail('');
                setRole('member');
                setSuccess(false);
              }}
            >
              Invite Another
            </Button>
            <Button
              onClick={() => {
                onSuccess();
                onClose();
              }}
            >
              Done
            </Button>
          </>
        }
      >
        <div className="rounded-md border border-success/40 bg-success/10 p-4 text-sm text-success">
          <p>
            An invitation email has been sent to <strong>{email}</strong>. They will receive
            instructions to join your organization.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={close}
      title="Invite Team Member"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" form={formId} isPending={isLoading} disabled={!email.trim()}>
            {isLoading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorNotice error={error} />}

        <TextField
          id="member-email"
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          required
          hint="An invitation will be sent to this email address"
        />

        <SelectField
          id="member-role"
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
        >
          <option value="member">Member - Basic access</option>
          <option value="admin">Admin - Can manage members and settings</option>
        </SelectField>

        {/* What the role actually permits, next to the choice rather than in the docs. */}
        <div className="rounded-md bg-muted p-3 text-sm">
          {role === 'admin' ? (
            <div className="space-y-1">
              <p className="font-medium">Admin Role</p>
              <ul className="list-inside list-disc text-muted-foreground">
                <li>Can invite and remove members</li>
                <li>Can change member roles (except owner)</li>
                <li>Can update organization settings</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">Member Role</p>
              <ul className="list-inside list-disc text-muted-foreground">
                <li>Can view organization data</li>
                <li>Can manage their own connections</li>
                <li>Cannot modify organization settings</li>
              </ul>
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}

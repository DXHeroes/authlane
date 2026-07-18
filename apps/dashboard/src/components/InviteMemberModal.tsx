import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <button
        type="button"
        aria-label="Dismiss dialog backdrop"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="invite-member-title" className="text-2xl font-bold">
            {success ? 'Invitation Sent' : 'Invite Team Member'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-500 bg-green-50 p-4">
              <p className="text-sm text-green-700">
                An invitation email has been sent to <strong>{email}</strong>. They will receive
                instructions to join your organization.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setEmail('');
                  setRole('member');
                  setSuccess(false);
                }}
                className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                Invite Another
              </button>
              <button
                type="button"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="member-email" className="mb-2 block text-sm font-medium">
                Email Address
              </label>
              <input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                An invitation will be sent to this email address
              </p>
            </div>

            <div>
              <label htmlFor="member-role" className="mb-2 block text-sm font-medium">
                Role
              </label>
              <select
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="member">Member - Basic access</option>
                <option value="admin">Admin - Can manage members and settings</option>
              </select>
            </div>

            {/* Role descriptions */}
            <div className="rounded-md bg-muted p-3 text-sm">
              {role === 'admin' ? (
                <div className="space-y-1">
                  <p className="font-medium text-blue-700">Admin Role</p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    <li>Can invite and remove members</li>
                    <li>Can change member roles (except owner)</li>
                    <li>Can update organization settings</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium text-gray-700">Member Role</p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    <li>Can view organization data</li>
                    <li>Can manage their own connections</li>
                    <li>Cannot modify organization settings</li>
                  </ul>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-500 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

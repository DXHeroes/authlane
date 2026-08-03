import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import ErrorNotice from '@/components/ErrorNotice';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth-client';

interface Member {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}

export default function OrganizationPage() {
  const { organization, user, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setSlug(organization.slug);
    }
  }, [organization]);

  // Get current user's role in the organization
  useEffect(() => {
    const loadMemberRole = async () => {
      try {
        const result = await authClient.organization.listMembers();
        if (result.data) {
          // The response might be { members: [...] } or just an array
          const responseData = result.data as { members?: Member[] } | Member[];
          const members = Array.isArray(responseData) ? responseData : responseData.members || [];

          const currentMember = members.find((m: Member) => m.userId === user?.id);
          if (currentMember) {
            setCurrentUserRole(currentMember.role);
          }
        }
      } catch (err) {
        console.warn('Failed to load member role:', err);
      }
    };

    if (organization && user) {
      loadMemberRole();
    }
  }, [organization, user]);

  const isOwner = currentUserRole === 'owner';
  const canEdit = isOwner || currentUserRole === 'admin';

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !canEdit) return;

    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      await authClient.organization.update({
        data: {
          name: name.trim(),
          slug: slug.trim(),
        },
      });
      setSuccess('Organization updated successfully');
      // Refresh the organization data
      await switchOrganization(organization.id);
    } catch (err) {
      setError(err ?? new Error('Failed to update organization'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!organization || !isOwner) return;
    if (deleteConfirmText !== organization.name) return;

    setIsDeleting(true);
    setError(null);

    try {
      await authClient.organization.delete({
        organizationId: organization.id,
      });
      // Navigate to dashboard after deletion
      navigate('/dashboard');
      // Force page reload to clear state
      window.location.reload();
    } catch (err) {
      setError(err ?? new Error('Failed to delete organization'));
      setIsDeleting(false);
    }
  };

  if (!organization) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-4 text-yellow-800">
          No organization selected. Please select or create an organization.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">Manage your organization details and settings</p>
      </div>

      {/* Organization Details Form */}
      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Organization Details</h2>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label htmlFor="org-name" className="mb-2 block text-sm font-medium">
              Organization Name
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="org-slug" className="mb-2 block text-sm font-medium">
              Organization Slug
            </label>
            <input
              id="org-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              disabled={!canEdit}
              className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">URL-friendly identifier</p>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Organization ID</span>
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono">
              {organization.id}
            </p>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Your Role</span>
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm capitalize">
              {currentUserRole || 'Loading...'}
            </p>
          </div>

          {error ? <ErrorNotice error={error} /> : null}

          {success && (
            <div className="rounded-md border border-green-500 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          {canEdit && (
            <div className="pt-4">
              <button
                type="submit"
                disabled={isUpdating || !name.trim() || !slug.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Danger Zone - Only for owners */}
      {isOwner && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-red-800">Danger Zone</h2>

          {!showDeleteConfirm ? (
            <div>
              <p className="mb-4 text-sm text-red-700">
                Deleting an organization is permanent and cannot be undone. All data associated with
                this organization will be permanently removed.
              </p>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-md border border-red-500 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete Organization
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-red-700">
                To confirm deletion, please type the organization name:{' '}
                <strong>{organization.name}</strong>
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type organization name to confirm"
                className="w-full max-w-md rounded-md border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || deleteConfirmText !== organization.name}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Permanently Delete Organization'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

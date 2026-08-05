import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import ErrorNotice from '@/components/ErrorNotice';
import Button from '@/components/ui/Button';
import Callout from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import PageHeader from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth-client';
import { toastError, toastSuccess } from '@/lib/toast';

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
  const { organization, organizations, user, switchOrganization, refreshOrganizations } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      await refreshOrganizations();
      toastSuccess(`${name.trim()} saved`);
    } catch (err) {
      setError(err ?? new Error('Failed to update organization'));
      toastError(err, 'Could not save the organization.');
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
      const deletedName = organization.name;
      await authClient.organization.delete({
        organizationId: organization.id,
      });

      /*
       * Deleting the active organization leaves the session pointing at nothing, so the
       * page used to reload to clear the state. Switching to whatever is left does the
       * same job: every cached query is dropped on the switch, and a workspace with no
       * organizations falls through to onboarding on the next render.
       */
      const remaining = organizations.filter((candidate) => candidate.id !== organization.id);
      queryClient.removeQueries();
      await refreshOrganizations();
      if (remaining[0]) await switchOrganization(remaining[0].id);
      navigate('/dashboard', { replace: true });
      toastSuccess(`${deletedName} deleted`);
    } catch (err) {
      setError(err ?? new Error('Failed to delete organization'));
      toastError(err, 'Could not delete the organization.');
      setIsDeleting(false);
    }
  };

  if (!organization) {
    return (
      <div className="p-6 sm:p-8">
        <Callout tone="warning">
          No organization selected. Select or create an organization to change its settings.
        </Callout>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="Organization Settings"
        description="Manage your organization details and settings."
      />

      <Card className="mb-8 p-6">
        <h2 className="heading-tight mb-4 text-lg font-semibold">Organization Details</h2>

        <form onSubmit={handleUpdate} className="space-y-4">
          <TextField
            id="org-name"
            label="Organization Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            fieldClassName="max-w-md"
          />

          <TextField
            id="org-slug"
            label="Organization Slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={!canEdit}
            hint="URL-friendly identifier"
            fieldClassName="max-w-md"
          />

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

          {success && <Callout tone="success">{success}</Callout>}

          {canEdit && (
            <div className="pt-4">
              <Button type="submit" isPending={isUpdating} disabled={!name.trim() || !slug.trim()}>
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </form>
      </Card>

      {/* Only an owner can delete, and only after typing the name back. */}
      {isOwner && (
        <Card className="border-destructive/40 bg-destructive/[0.04] p-6">
          <h2 className="heading-tight mb-4 text-lg font-semibold text-destructive">Danger Zone</h2>

          {!showDeleteConfirm ? (
            <div>
              <p className="mb-4 max-w-prose text-sm text-muted-foreground">
                Deleting an organization is permanent. Every connection, key and member record
                belonging to it goes with it.
              </p>
              <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                Delete Organization
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <TextField
                label={`Type ${organization.name} to confirm`}
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={organization.name}
                fieldClassName="max-w-md"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  isPending={isDeleting}
                  disabled={deleteConfirmText !== organization.name}
                >
                  {isDeleting ? 'Deleting...' : 'Permanently Delete Organization'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

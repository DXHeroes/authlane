import { PlusIcon, UsersIcon } from '@heroicons/react/16/solid';
import { useCallback, useEffect, useState } from 'react';
import ErrorNotice from '@/components/ErrorNotice';
import InviteMemberModal from '@/components/InviteMemberModal';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonTable } from '@/components/ui/Skeleton';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth-client';
import { toastError, toastSuccess } from '@/lib/toast';

interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}

const ROLE_TONES: Record<Member['role'], BadgeTone> = {
  owner: 'info',
  admin: 'info',
  member: 'neutral',
};

const ROLE_LEGEND: ReadonlyArray<{ role: Member['role']; label: string; meaning: string }> = [
  { role: 'owner', label: 'Owner', meaning: 'Full access, can delete organization' },
  { role: 'admin', label: 'Admin', meaning: 'Can manage members and settings' },
  { role: 'member', label: 'Member', meaning: 'Basic access' },
];

export default function MembersPage() {
  const { organization, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Member | null>(null);

  const loadMembers = useCallback(async () => {
    if (!organization) return;

    setIsLoading(true);
    try {
      const result = await authClient.organization.listMembers();
      if (result.data) {
        // The response might be { members: [...] } or just an array
        const responseData = result.data as { members?: Member[] } | Member[];
        const memberList = Array.isArray(responseData) ? responseData : responseData.members || [];

        setMembers(memberList as Member[]);

        // Find current user's role
        const currentMember = memberList.find((m: Member) => m.userId === user?.id);
        if (currentMember) {
          setCurrentUserRole(currentMember.role);
        }
      }
    } catch (err) {
      console.error('Failed to load members:', err);
      setError(new Error('Failed to load members'));
    } finally {
      setIsLoading(false);
    }
  }, [organization, user?.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin';
  const canManageMembers = isOwner || isAdmin;

  const handleRoleChange = async (member: Member, newRole: 'admin' | 'member') => {
    if (!canManageMembers) return;

    setActionLoading(member.id);
    try {
      await authClient.organization.updateMemberRole({
        memberId: member.id,
        role: newRole,
      });
      await loadMembers();
      toastSuccess(`${member.user.name} is now ${newRole === 'admin' ? 'an admin' : 'a member'}`);
    } catch (err) {
      setError(err ?? new Error('Failed to update role'));
      toastError(err, 'Could not update the role.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!canManageMembers) return;

    setActionLoading(member.id);
    try {
      await authClient.organization.removeMember({
        memberIdOrEmail: member.id,
      });
      setPendingRemoval(null);
      await loadMembers();
      toastSuccess(`${member.user.name} removed from ${organization?.name ?? 'the organization'}`);
    } catch (err) {
      setError(err ?? new Error('Failed to remove member'));
      toastError(err, 'Could not remove the member.');
    } finally {
      setActionLoading(null);
    }
  };

  if (!organization) {
    return (
      <div className="p-6 sm:p-8">
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          No organization selected. Select or create an organization to manage members.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="Team Members"
        description={`Manage members and their roles in ${organization.name}.`}
        actions={
          canManageMembers && (
            <Button
              onClick={() => setShowInviteModal(true)}
              icon={<PlusIcon className="size-4 fill-current" aria-hidden="true" />}
            >
              Invite Member
            </Button>
          )
        }
      />

      {error ? (
        <div className="mb-4">
          <ErrorNotice error={error} />
          <Button variant="link" onClick={() => setError(null)} className="mt-2 text-sm">
            Dismiss
          </Button>
        </div>
      ) : null}

      <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {ROLE_LEGEND.map(({ role, label, meaning }) => (
          <div key={role} className="flex items-center gap-2">
            <dt>
              <Badge tone={ROLE_TONES[role]}>{label}</Badge>
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      {isLoading ? (
        <LoadingRegion label="Loading members">
          <SkeletonTable rows={3} columns={4} />
        </LoadingRegion>
      ) : (
        <Card>
          {members.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No members yet">
              Invite a colleague and they will show up here once they accept.
            </EmptyState>
          ) : (
            <Table caption={`Members of ${organization.name}`}>
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Member</Th>
                  <Th>Role</Th>
                  <Th>Joined</Th>
                  {canManageMembers && <Th className="text-right">Actions</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {members.map((member) => {
                  const isCurrentUser = member.userId === user?.id;
                  const isMemberOwner = member.role === 'owner';
                  const canModify = canManageMembers && !isCurrentUser && !isMemberOwner;
                  const isActionLoading = actionLoading === member.id;

                  return (
                    <Tr key={member.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div
                            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
                            aria-hidden="true"
                          >
                            {member.user.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {member.user.name}
                              {isCurrentUser && (
                                <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                              )}
                            </div>
                            <div className="truncate text-sm text-muted-foreground">
                              {member.user.email}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {canModify && !isActionLoading ? (
                          <>
                            <label className="sr-only" htmlFor={`role-${member.id}`}>
                              Role for {member.user.name}
                            </label>
                            <select
                              id={`role-${member.id}`}
                              value={member.role}
                              onChange={(e) =>
                                handleRoleChange(member, e.target.value as 'admin' | 'member')
                              }
                              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </select>
                          </>
                        ) : (
                          <Badge tone={ROLE_TONES[member.role]}>
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </Td>
                      {canManageMembers && (
                        <Td className="text-right">
                          {canModify && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setPendingRemoval(member)}
                              isPending={isActionLoading}
                            >
                              {isActionLoading ? 'Removing...' : 'Remove'}
                            </Button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </Card>
      )}

      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            loadMembers();
          }}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingRemoval(null);
          }}
          title={`Remove ${pendingRemoval.user.name}?`}
          confirmLabel="Remove member"
          isPending={actionLoading === pendingRemoval.id}
          onConfirm={() => handleRemoveMember(pendingRemoval)}
        >
          <p>
            They lose access to {organization.name} and everything in it. Their own connections stay
            intact — invite them again to restore access.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

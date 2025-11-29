import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { authClient } from '@/lib/auth-client'
import InviteMemberModal from '@/components/InviteMemberModal'

interface Member {
  id: string
  userId: string
  organizationId: string
  role: 'owner' | 'admin' | 'member'
  createdAt: Date
  user: {
    id: string
    name: string
    email: string
    image?: string
  }
}

export default function MembersPage() {
  const { organization, user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadMembers = async () => {
    if (!organization) return

    setIsLoading(true)
    try {
      const result = await authClient.organization.listMembers()
      if (result.data) {
        // The response might be { members: [...] } or just an array
        const responseData = result.data as { members?: Member[] } | Member[]
        const memberList = Array.isArray(responseData) 
          ? responseData 
          : (responseData.members || [])
        
        setMembers(memberList as Member[])
        
        // Find current user's role
        const currentMember = memberList.find((m: Member) => m.userId === user?.id)
        if (currentMember) {
          setCurrentUserRole(currentMember.role)
        }
      }
    } catch (err) {
      console.error('Failed to load members:', err)
      setError('Failed to load members')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [organization, user])

  const isOwner = currentUserRole === 'owner'
  const isAdmin = currentUserRole === 'admin'
  const canManageMembers = isOwner || isAdmin

  const handleRoleChange = async (memberId: string, newRole: 'admin' | 'member') => {
    if (!canManageMembers) return

    setActionLoading(memberId)
    try {
      await authClient.organization.updateMemberRole({
        memberId,
        role: newRole,
      })
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!canManageMembers) return
    if (!confirm(`Are you sure you want to remove ${memberName} from the organization?`)) return

    setActionLoading(memberId)
    try {
      await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
      })
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setActionLoading(null)
    }
  }

  if (!organization) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-4 text-yellow-800">
          No organization selected. Please select or create an organization.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-muted-foreground">
            Manage members and their roles in {organization.name}
          </p>
        </div>
        {canManageMembers && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Invite Member
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Role Legend */}
      <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            Owner
          </span>
          <span>Full access, can delete organization</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            Admin
          </span>
          <span>Can manage members and settings</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            Member
          </span>
          <span>Basic access</span>
        </div>
      </div>

      {/* Members List */}
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No members found</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Member</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
                {canManageMembers && (
                  <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => {
                const isCurrentUser = member.userId === user?.id
                const isMemberOwner = member.role === 'owner'
                const canModify = canManageMembers && !isCurrentUser && !isMemberOwner
                const isActionLoading = actionLoading === member.id

                return (
                  <tr key={member.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                          {member.user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="font-medium">
                            {member.user.name}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{member.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canModify && !isActionLoading ? (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.id, e.target.value as 'admin' | 'member')
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            member.role === 'owner'
                              ? 'bg-purple-100 text-purple-700'
                              : member.role === 'admin'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>
                    {canManageMembers && (
                      <td className="px-4 py-3 text-right">
                        {canModify && (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.user.name)}
                            disabled={isActionLoading}
                            className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {isActionLoading ? 'Removing...' : 'Remove'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false)
            loadMembers()
          }}
        />
      )}
    </div>
  )
}


import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth-client';

export type OrganizationRole = 'owner' | 'admin' | 'member';

interface MemberRow {
  userId: string;
  role: OrganizationRole;
}

/**
 * The signed-in user's role in the active organization.
 *
 * The session carries no role, so it has to be read back from the member list — the same lookup
 * Members and Organization do inline. It is a hint for the interface, never a decision: the API
 * re-checks the role on every mutation and answers 403 `INSUFFICIENT_SCOPE` regardless of what the
 * dashboard chose to render. `null` while loading, and after a failure, so a page that gates on
 * `canManage` fails closed rather than offering controls the API will refuse.
 */
export function useOrganizationRole(): { role: OrganizationRole | null; isLoading: boolean } {
  const { organization, user } = useAuth();
  const [role, setRole] = useState<OrganizationRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organization || !user) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    void (async () => {
      try {
        const result = await authClient.organization.listMembers();
        if (!active) return;
        // Better Auth has answered this as both a bare array and `{ members }` across versions.
        const payload = (result.data ?? []) as { members?: MemberRow[] } | MemberRow[];
        const members = Array.isArray(payload) ? payload : (payload.members ?? []);
        setRole(members.find((member) => member.userId === user.id)?.role ?? null);
      } catch (error) {
        if (!active) return;
        console.warn('Failed to load member role:', error);
        setRole(null);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [organization, user]);

  return { role, isLoading };
}

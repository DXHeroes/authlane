import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';

// Types
interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  image?: string;
  createdAt: Date;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: Date;
}

interface Session {
  user: User;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    activeOrganizationId?: string;
  };
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  organizations: Organization[];
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  createOrganization: (name: string, slug: string) => Promise<Organization>;
  refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load all organizations
  const refreshOrganizations = async () => {
    try {
      const result = await authClient.organization.list();
      if (result.data) {
        setOrganizations(result.data as unknown as Organization[]);
      }
    } catch (err) {
      console.warn('Failed to load organizations:', err);
    }
  };

  // Load session on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const result = await authClient.getSession();
        if (result.data) {
          setSession(result.data as Session);

          // Load all organizations
          const orgsResult = await authClient.organization.list();
          const orgs = (orgsResult.data as unknown as Organization[]) || [];
          setOrganizations(orgs);

          // Load active organization if set
          if (result.data.session.activeOrganizationId) {
            try {
              const orgResult = await authClient.organization.getFullOrganization();
              if (orgResult.data) {
                setOrganization(orgResult.data as unknown as Organization);
              }
            } catch (err) {
              console.warn('Failed to load organization:', err);
            }
          }
          // AUTO-SELECT: If no active org but user has orgs, select the first one
          else if (orgs.length > 0) {
            try {
              await authClient.organization.setActive({ organizationId: orgs[0].id });
              setOrganization(orgs[0]);
            } catch (err) {
              console.warn('Failed to auto-select organization:', err);
            }
          }
        }
      } catch (err) {
        console.error('[AuthContext] Failed to load session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authClient.signIn.email({
      email,
      password,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Login failed');
    }

    // Reload session
    const sessionResult = await authClient.getSession();
    if (sessionResult.data) {
      setSession(sessionResult.data as Session);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    // Sign up
    const result = await authClient.signUp.email({
      name,
      email,
      password,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Registration failed');
    }

    // Create default organization
    const orgSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');
    const orgResult = await authClient.organization.create({
      name,
      slug: orgSlug,
    });

    if (orgResult.data) {
      const newOrg = orgResult.data as unknown as Organization;
      // Automatically set the new org as active
      await authClient.organization.setActive({
        organizationId: newOrg.id,
      });
      setOrganization(newOrg);
      setOrganizations([newOrg]);
    }

    // Reload session
    const sessionResult = await authClient.getSession();
    if (sessionResult.data) {
      setSession(sessionResult.data as Session);
    }
  };

  const logout = async () => {
    await authClient.signOut();
    setSession(null);
    setOrganization(null);
  };

  const switchOrganization = async (organizationId: string) => {
    const result = await authClient.organization.setActive({
      organizationId,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to switch organization');
    }

    // Reload organization
    const orgResult = await authClient.organization.getFullOrganization();
    if (orgResult.data) {
      setOrganization(orgResult.data as unknown as Organization);
    }

    // Reload session to get updated activeOrganizationId
    const sessionResult = await authClient.getSession();
    if (sessionResult.data) {
      setSession(sessionResult.data as Session);
    }
  };

  const createOrganization = async (name: string, slug: string): Promise<Organization> => {
    const result = await authClient.organization.create({
      name,
      slug,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to create organization');
    }

    // Refresh organizations list
    await refreshOrganizations();

    return result.data as unknown as Organization;
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        organization,
        organizations,
        session,
        isAuthenticated: !!session?.user,
        isLoading,
        login,
        register,
        logout,
        switchOrganization,
        createOrganization,
        refreshOrganizations,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

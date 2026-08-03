import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { organizationSlug } from '@/lib/auth-helpers';

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

export type AuthMode = 'magic-link' | 'email-password';

interface MagicLinkDestinations {
  callbackURL: string;
  newUserCallbackURL?: string;
  errorCallbackURL: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  organizations: Organization[];
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMode: AuthMode;
  signUpEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestMagicLink: (email: string, destinations: MagicLinkDestinations) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ verificationPending: boolean }>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  createOrganization: (name: string, slug: string) => Promise<Organization>;
  completeOnboarding: (name: string, organizationName: string) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('email-password');
  const [signUpEnabled, setSignUpEnabled] = useState(false);

  /**
   * Throws away everything the cache holds for the organization we are leaving.
   *
   * Query keys carry no organization id and queries stay fresh for five minutes, so without this
   * every screen keeps rendering the previous workspace's connections, services and keys after a
   * switch. Removing rather than invalidating matters: an invalidated query still shows its cached
   * data while it refetches, which is exactly the data that must not be on screen.
   */
  const discardOrganizationScopedCache = () => {
    queryClient.removeQueries();
  };

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
        const configResponse = await fetch('/api/auth/config', { credentials: 'include' });
        if (!configResponse.ok) throw new Error('Authentication configuration is unavailable');
        const configResult = (await configResponse.json()) as {
          data: { mode: AuthMode; signUpEnabled: boolean };
        };
        setAuthMode(configResult.data.mode);
        setSignUpEnabled(configResult.data.signUpEnabled);

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

    // A completed password sign-in may still require the two-factor page.
    // Only initialize organization state after Better Auth has issued a full session.
    const sessionResult = await authClient.getSession();
    if (!sessionResult.data) return;
    let nextSession = sessionResult.data as Session;
    const organizationsResult = await authClient.organization.list();
    const nextOrganizations = (organizationsResult.data as unknown as Organization[]) || [];
    setOrganizations(nextOrganizations);
    if (!nextSession.session.activeOrganizationId && nextOrganizations[0]) {
      await authClient.organization.setActive({ organizationId: nextOrganizations[0].id });
      const activeSession = await authClient.getSession();
      if (activeSession.data) nextSession = activeSession.data as Session;
    }
    setSession(nextSession);
    if (nextOrganizations[0]) setOrganization(nextOrganizations[0]);
  };

  const requestMagicLink = async (email: string, destinations: MagicLinkDestinations) => {
    const result = await authClient.signIn.magicLink({
      email,
      ...destinations,
    });
    if (result.error) throw new Error(result.error.message || 'Could not send sign-in link');
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

    const sessionResult = await authClient.getSession();
    if (sessionResult.data) {
      setSession(sessionResult.data as Session);
      return { verificationPending: false };
    }
    return { verificationPending: true };
  };

  const logout = async () => {
    await authClient.signOut();
    setSession(null);
    setOrganization(null);
    setOrganizations([]);
    discardOrganizationScopedCache();
  };

  const switchOrganization = async (organizationId: string) => {
    const result = await authClient.organization.setActive({
      organizationId,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to switch organization');
    }

    discardOrganizationScopedCache();

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

  const completeOnboarding = async (name: string, organizationName: string) => {
    const updateResult = await authClient.updateUser({ name });
    if (updateResult.error) {
      throw new Error(updateResult.error.message || 'Could not update your profile');
    }

    const existingResult = await authClient.organization.list();
    if (existingResult.error) {
      throw new Error(existingResult.error.message || 'Could not load your workspaces');
    }
    const existingOrganizations = (existingResult.data as unknown as Organization[]) || [];
    let nextOrganization = existingOrganizations[0];

    if (!nextOrganization) {
      const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
      const createResult = await authClient.organization.create({
        name: organizationName,
        slug: organizationSlug(organizationName, suffix),
      });
      if (createResult.error || !createResult.data) {
        throw new Error(createResult.error?.message || 'Could not create your workspace');
      }
      nextOrganization = createResult.data as unknown as Organization;
    }

    const activeResult = await authClient.organization.setActive({
      organizationId: nextOrganization.id,
    });
    if (activeResult.error) {
      throw new Error(activeResult.error.message || 'Could not activate your workspace');
    }

    discardOrganizationScopedCache();

    const organizationsResult = await authClient.organization.list();
    const refreshedOrganizations =
      (organizationsResult.data as unknown as Organization[] | null) ?? [];
    setOrganizations(
      refreshedOrganizations.length > 0 ? refreshedOrganizations : [nextOrganization]
    );
    setOrganization(nextOrganization);
    const sessionResult = await authClient.getSession();
    if (sessionResult.data) setSession(sessionResult.data as Session);
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
        authMode,
        signUpEnabled,
        login,
        requestMagicLink,
        register,
        logout,
        switchOrganization,
        createOrganization,
        completeOnboarding,
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

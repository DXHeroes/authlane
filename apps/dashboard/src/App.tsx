import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Toaster } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import Spinner from '@/components/ui/Spinner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { parksAnAuthorization } from '@/lib/oauth-flow';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';
import ApiKeysPage from '@/pages/ApiKeysPage';
import ConnectionsPage from '@/pages/ConnectionsPage';
import DashboardHome from '@/pages/DashboardHome';
import LoginPage from '@/pages/LoginPage';
import McpServersPage from '@/pages/McpServersPage';
import MembersPage from '@/pages/MembersPage';
import OAuthClientsPage from '@/pages/OAuthClientsPage';
import OAuthConsentPage from '@/pages/OAuthConsentPage';
import OnboardingPage from '@/pages/OnboardingPage';
import OrganizationPage from '@/pages/OrganizationPage';
import ReauthPage from '@/pages/ReauthPage';
import RegisterPage from '@/pages/RegisterPage';
import SandboxPage from '@/pages/SandboxPage';
import SecurityPage from '@/pages/SecurityPage';
import ServiceDetailPage from '@/pages/ServiceDetailPage';
import ServicesPage from '@/pages/ServicesPage';
import SettingsPage from '@/pages/SettingsPage';
import TwoFactorPage from '@/pages/TwoFactorPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function StepUpNavigator() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleStepUp = () => {
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const returnTo = currentPath.startsWith('/dashboard') ? currentPath : '/dashboard';
      navigate(`/reauth?returnTo=${encodeURIComponent(returnTo)}`);
    };
    window.addEventListener('authlane:step-up-required', handleStepUp);
    return () => window.removeEventListener('authlane:step-up-required', handleStepUp);
  }, [location, navigate]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, organizations } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex h-dvh items-center justify-center gap-3 text-muted-foreground"
        role="status"
        aria-busy="true"
      >
        <Spinner className="size-5" />
        <span>Checking your session</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (organizations.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

/**
 * The login route, which an already-signed-in user normally never sees.
 *
 * The exceptions are the three ways better-auth's oidc-provider parks somebody else's sign-in on
 * this page. Bouncing any of them to the dashboard kills the authorization silently and leaves the
 * application that asked waiting for a callback that never comes, so each one has to render
 * LoginPage instead and let it decide what to do:
 *
 *  - the full authorize query, forwarded when there is no session at all;
 *  - a re-authentication prompt (`prompt=login`, or an expired `max_age`), which carries only
 *    `client_id`, `code` and `state` — the one shape that arrives with a session already, and the
 *    reason this check cannot simply be "is there a query";
 *  - a consent request whose session lapsed before the screen rendered.
 */
export function LoginRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated && !parksAnAuthorization(location.search)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}

/**
 * The consent screen, which needs a session the flow normally guarantees.
 *
 * When it has lapsed, the request goes to the login page rather than being dropped: signing in
 * there brings the user straight back here. Without the query the sign-in would end on the
 * dashboard and the application would wait forever.
 */
export function ConsentRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={`/login${location.search}`} replace />;
  }
  return <OAuthConsentPage />;
}

function AppRoutes() {
  const { authMode, isAuthenticated, isLoading, organizations, signUpEnabled } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex h-dvh items-center justify-center gap-3 text-muted-foreground"
        role="status"
        aria-busy="true"
      >
        <Spinner className="size-5" />
        <span>Checking your session</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      {/*
        The consent screen better-auth's oidc-provider redirects to (`consentPage` in
        apps/api/src/lib/oidc-provider-config.ts). It sits outside ProtectedRoute for the same
        reason invitation acceptance does: that gate sends anyone without an organization to
        /onboarding, and a user consenting has a workspace but not necessarily an active one.
      */}
      <Route path="/oauth/consent" element={<ConsentRoute />} />
      <Route
        path="/register"
        element={
          isAuthenticated ? (
            <Navigate to={organizations.length > 0 ? '/dashboard' : '/onboarding'} replace />
          ) : authMode === 'magic-link' || !signUpEnabled ? (
            <Navigate to="/login" replace />
          ) : (
            <RegisterPage />
          )
        }
      />
      <Route
        path="/onboarding"
        element={
          !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : organizations.length > 0 ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <OnboardingPage />
          )
        }
      />
      <Route
        path="/two-factor"
        element={
          authMode === 'email-password' ? <TwoFactorPage /> : <Navigate to="/dashboard" replace />
        }
      />
      <Route
        path="/reauth"
        element={isAuthenticated ? <ReauthPage /> : <Navigate to="/login" replace />}
      />
      {/*
        Accepting an invitation must sit outside ProtectedRoute: an invited user has no
        organization yet, and ProtectedRoute sends anyone with none to /onboarding. Accepting is
        what gives them their first organization, so the gate would make the link unusable for
        exactly the people it is sent to.
      */}
      <Route
        path="/dashboard/accept-invitation/:invitationId"
        element={isAuthenticated ? <AcceptInvitationPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:id" element={<ServiceDetailPage />} />
        <Route path="mcp-servers" element={<McpServersPage />} />
        <Route path="sandbox" element={<SandboxPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="oauth-clients" element={<OAuthClientsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="organization" element={<OrganizationPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

/** The toaster follows the theme, otherwise a light toast flashes over the dark app. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <StepUpNavigator />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
        <ThemedToaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

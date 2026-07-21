import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import ApiKeysPage from '@/pages/ApiKeysPage';
import ConnectionsPage from '@/pages/ConnectionsPage';
import DashboardHome from '@/pages/DashboardHome';
import LoginPage from '@/pages/LoginPage';
import MembersPage from '@/pages/MembersPage';
import OnboardingPage from '@/pages/OnboardingPage';
import OrganizationPage from '@/pages/OrganizationPage';
import ReauthPage from '@/pages/ReauthPage';
import RegisterPage from '@/pages/RegisterPage';
import SecurityPage from '@/pages/SecurityPage';
import SandboxPage from '@/pages/SandboxPage';
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
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
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

function AppRoutes() {
  const { authMode, isAuthenticated, isLoading, organizations, signUpEnabled } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
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
        <Route path="sandbox" element={<SandboxPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="organization" element={<OrganizationPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <StepUpNavigator />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

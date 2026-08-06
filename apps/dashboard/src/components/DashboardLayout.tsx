import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  BeakerIcon,
  BuildingOfficeIcon,
  Cog6ToothIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  PuzzlePieceIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import CreateOrganizationModal from './CreateOrganizationModal';
import OrganizationSelector from './OrganizationSelector';
import ThemeToggle from './ThemeToggle';

const productNavigation = [
  { to: '/dashboard', end: true, label: 'Dashboard', icon: HomeIcon },
  { to: '/dashboard/connections', label: 'Connections', icon: LinkIcon },
  { to: '/dashboard/services', label: 'Services', icon: Squares2X2Icon },
  { to: '/dashboard/mcp-servers', label: 'MCP Servers', icon: ServerStackIcon },
  { to: '/dashboard/sandbox', label: 'Sandbox', icon: BeakerIcon },
  { to: '/dashboard/api-keys', label: 'API Keys', icon: KeyIcon },
  { to: '/dashboard/oauth-clients', label: 'Connected Apps', icon: PuzzlePieceIcon },
  { to: '/dashboard/security', label: 'Security', icon: ShieldCheckIcon },
] as const;

const organizationNavigation = [
  { to: '/dashboard/members', label: 'Members', icon: UsersIcon },
  { to: '/dashboard/organization', label: 'Organization', icon: BuildingOfficeIcon },
  { to: '/dashboard/settings', label: 'Settings', icon: Cog6ToothIcon },
] as const;

export default function DashboardLayout() {
  const { user, organization, logout, refreshOrganizations } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // A drawer that cannot be dismissed with Escape, that leaves focus on the page behind
  // it, and that lets the page scroll underneath is a drawer people get stuck in.
  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    sidebarRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavigationOpen]);

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
    toggleRef.current?.focus();
  };

  const navLinkClass = (isActive: boolean) =>
    `relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? // The rail is what makes the current page readable at a glance; the tint alone
          // is too quiet to find without looking for it.
          'bg-muted text-foreground before:absolute before:inset-y-1.5 before:-left-0.5 before:w-0.5 before:rounded-full before:bg-primary'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    }`;

  const renderLinks = (
    items: ReadonlyArray<{
      to: string;
      label: string;
      icon: typeof HomeIcon;
      end?: boolean;
    }>
  ) =>
    items.map(({ to, label, icon: Icon, end }) => (
      // NavLink already sets aria-current="page" on the active route.
      <NavLink
        key={to}
        to={to}
        end={end}
        onClick={() => setMobileNavigationOpen(false)}
        className={({ isActive }: { isActive: boolean }) => navLinkClass(isActive)}
      >
        <Icon className="size-4 shrink-0 fill-current" aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
      </NavLink>
    ));

  return (
    <div className="isolate flex h-dvh min-w-0 flex-col bg-background antialiased">
      <a href="#dashboard-content" className="skip-link">
        Skip to content
      </a>

      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 lg:hidden">
        <div className="flex min-w-0 items-baseline gap-2">
          <a href="/dashboard" aria-label="Homepage" className="font-semibold tracking-tight">
            Authlane
          </a>
          {/* Which workspace you are in is not a detail worth hiding on a phone. */}
          {organization?.name && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {organization.name}
            </span>
          )}
        </div>
        <button
          ref={toggleRef}
          type="button"
          aria-label={mobileNavigationOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavigationOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setMobileNavigationOpen((open) => !open)}
          className="relative z-50 grid size-9 shrink-0 place-items-center rounded-md text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
            aria-hidden="true"
          />
          {mobileNavigationOpen ? (
            <XMarkIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
          ) : (
            <Bars3Icon className="size-4 shrink-0 fill-current" aria-hidden="true" />
          )}
        </button>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        {mobileNavigationOpen && (
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeMobileNavigation}
            className="fixed inset-0 z-30 animate-fade-in bg-neutral-950/40 lg:hidden"
          />
        )}

        <aside
          ref={sidebarRef}
          id="dashboard-navigation"
          tabIndex={-1}
          className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-border bg-background shadow-xl transition-transform duration-200 ease-out focus:outline-none dark:shadow-none lg:static lg:w-64 lg:translate-x-0 lg:shadow-none ${
            mobileNavigationOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
            <a
              href="/dashboard"
              aria-label="Homepage"
              className="heading-tight text-xl font-semibold"
            >
              Authlane
            </a>
          </div>

          <div className="border-b border-border p-4">
            <OrganizationSelector onCreateNew={() => setShowCreateOrgModal(true)} />
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Dashboard navigation">
            <div className="flex flex-col gap-1">{renderLinks(productNavigation)}</div>
            <div className="flex flex-col gap-1 pt-6">
              <p className="px-3 pb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                Organization
              </p>
              {renderLinks(organizationNavigation)}
            </div>
          </nav>

          <div className="space-y-3 border-t border-border p-4">
            <div className="flex min-w-0 flex-col gap-0.5 px-3">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => logout()}
              className="relative flex h-9 w-full items-center gap-2 rounded-md bg-secondary py-2 pl-2 pr-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
                aria-hidden="true"
              />
              <ArrowRightStartOnRectangleIcon
                className="size-4 shrink-0 fill-current"
                aria-hidden="true"
              />
              Sign out
            </button>
          </div>
        </aside>

        <main id="dashboard-content" className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {showCreateOrgModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateOrgModal(false)}
          onSuccess={() => {
            setShowCreateOrgModal(false);
            // Reloading the page threw away the router position, the query cache and the
            // scroll offset to pick up one new organization. Refreshing the two things
            // that actually changed does the same job without the flash.
            void refreshOrganizations();
            void queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

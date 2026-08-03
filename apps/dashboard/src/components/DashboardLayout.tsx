import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  BeakerIcon,
  BuildingOfficeIcon,
  Cog6ToothIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import CreateOrganizationModal from './CreateOrganizationModal';
import OrganizationSelector from './OrganizationSelector';

const productNavigation = [
  { to: '/dashboard', end: true, label: 'Dashboard', icon: HomeIcon },
  { to: '/dashboard/connections', label: 'Connections', icon: LinkIcon },
  { to: '/dashboard/services', label: 'Services', icon: Squares2X2Icon },
  { to: '/dashboard/mcp-servers', label: 'MCP Servers', icon: ServerStackIcon },
  { to: '/dashboard/sandbox', label: 'Sandbox', icon: BeakerIcon },
  { to: '/dashboard/api-keys', label: 'API Keys', icon: KeyIcon },
  { to: '/dashboard/security', label: 'Security', icon: ShieldCheckIcon },
] as const;

const organizationNavigation = [
  { to: '/dashboard/members', label: 'Members', icon: UsersIcon },
  { to: '/dashboard/organization', label: 'Organization', icon: BuildingOfficeIcon },
  { to: '/dashboard/settings', label: 'Settings', icon: Cog6ToothIcon },
] as const;

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const navLinkClass = (isActive: boolean) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
      isActive
        ? 'bg-muted text-foreground'
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
      <NavLink
        key={to}
        to={to}
        end={end}
        onClick={() => setMobileNavigationOpen(false)}
        className={({ isActive }) => navLinkClass(isActive)}
      >
        <Icon className="size-4 shrink-0 fill-current" aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
      </NavLink>
    ));

  return (
    <div className="isolate flex h-dvh min-w-0 flex-col bg-background antialiased">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-foreground/10 px-4 lg:hidden">
        <a href="/dashboard" aria-label="Homepage" className="font-semibold tracking-tight">
          Authlane
        </a>
        <button
          type="button"
          aria-label={mobileNavigationOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavigationOpen}
          onClick={() => setMobileNavigationOpen((open) => !open)}
          className="relative z-50 grid size-9 place-items-center rounded-md text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
            onClick={() => setMobileNavigationOpen(false)}
            className="fixed inset-0 z-30 bg-neutral-950/30 lg:hidden"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-foreground/10 bg-background shadow-xl dark:shadow-none lg:static lg:w-64 lg:translate-x-0 lg:shadow-none ${
            mobileNavigationOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 shrink-0 items-center border-b border-foreground/10 px-6">
            <a
              href="/dashboard"
              aria-label="Homepage"
              className="text-xl font-semibold tracking-tight"
            >
              Authlane
            </a>
          </div>

          <div className="border-b border-foreground/10 p-4">
            <OrganizationSelector onCreateNew={() => setShowCreateOrgModal(true)} />
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Dashboard navigation">
            <div className="flex flex-col gap-1">{renderLinks(productNavigation)}</div>
            <div className="flex flex-col gap-1 pt-6">
              <p className="px-3 pb-2 font-mono text-xs tracking-wide text-muted-foreground">
                Organization
              </p>
              {renderLinks(organizationNavigation)}
            </div>
          </nav>

          <div className="border-t border-foreground/10 p-4">
            <div className="flex min-w-0 flex-col gap-1 px-3 pb-3">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="relative flex h-9 w-full items-center gap-2 rounded-md bg-secondary py-2 pl-2 pr-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {showCreateOrgModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateOrgModal(false)}
          onSuccess={() => {
            setShowCreateOrgModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

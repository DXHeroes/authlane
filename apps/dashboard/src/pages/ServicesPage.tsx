import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import type { OrganizationService, Service } from '@/types';

/**
 * Auth type badge component
 */
function AuthTypeBadge({ authType }: { authType: string }) {
  const badges = {
    oauth2: { label: 'OAuth 2.0', className: 'bg-blue-100 text-blue-700' },
    api_key: { label: 'API Key', className: 'bg-amber-100 text-amber-700' },
    none: { label: 'Public API', className: 'bg-green-100 text-green-700' },
  };
  const badge = badges[authType as keyof typeof badges] || badges.none;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

/**
 * Get display name for auth type category
 */
function getAuthTypeLabel(authType: string): string {
  const labels: Record<string, string> = {
    oauth2: 'OAuth 2.0 Services',
    api_key: 'API Key Services',
    none: 'Public APIs (No Auth Required)',
  };
  return labels[authType] || authType;
}

/**
 * Get description for auth type category
 */
function getAuthTypeDescription(authType: string): string {
  const descriptions: Record<string, string> = {
    oauth2: 'Requires OAuth app setup with Client ID and Client Secret',
    api_key: 'Requires an API key from the service provider',
    none: 'Free to use without any authentication credentials',
  };
  return descriptions[authType] || '';
}

export default function ServicesPage() {
  const queryClient = useQueryClient();

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
  });

  const { data: orgServices } = useQuery({
    queryKey: ['org-services'],
    queryFn: () => api.get<OrganizationService[]>('/organization/services').catch(() => []),
  });

  const toggleServiceMutation = useMutation({
    mutationFn: ({ serviceId, enabled }: { serviceId: string; enabled: boolean }) =>
      api.put(`/organization/services/${serviceId}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-services'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const getOrgService = (serviceId: string) => {
    if (!Array.isArray(orgServices)) return undefined;
    return orgServices.find((os: OrganizationService) => os.serviceId === serviceId);
  };

  // Group services by auth type
  const authTypes = ['none', 'api_key', 'oauth2']; // Show public APIs first
  const groupedServices = authTypes
    .map((authType) => ({
      authType,
      services: services?.filter((s: Service) => s.authType === authType) ?? [],
    }))
    .filter((group) => group.services.length > 0);

  // Stats
  const totalServices = services?.length ?? 0;
  const enabledServices = orgServices?.filter((os: OrganizationService) => os.enabled).length ?? 0;
  const publicApiCount = services?.filter((s: Service) => s.authType === 'none').length ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Services</h1>
        <p className="mt-2 text-muted-foreground">Configure integrations for your organization</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold">{totalServices}</div>
          <div className="text-sm text-muted-foreground">Total Services</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold text-green-600">{enabledServices}</div>
          <div className="text-sm text-muted-foreground">Enabled Services</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold text-blue-600">{publicApiCount}</div>
          <div className="text-sm text-muted-foreground">Public APIs (No Setup Needed)</div>
        </div>
      </div>

      {groupedServices.map(({ authType, services: categoryServices }) => (
        <div key={authType} className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{getAuthTypeLabel(authType)}</h2>
            <p className="text-sm text-muted-foreground">{getAuthTypeDescription(authType)}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categoryServices.map((service: Service) => {
              const orgService = getOrgService(service.id);
              const isEnabled = Boolean(orgService?.enabled);
              const config = service.config;

              return (
                <div
                  key={service.id}
                  className="rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {service.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold">{service.name}</h3>
                        <AuthTypeBadge authType={service.authType} />
                      </div>
                    </div>
                  </div>

                  {config?.description && (
                    <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                      {config.description}
                    </p>
                  )}

                  {config?.api_base_url && (
                    <p className="mb-3 text-xs text-muted-foreground font-mono truncate">
                      {config.api_base_url}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() =>
                        toggleServiceMutation.mutate({
                          serviceId: service.id,
                          enabled: !isEnabled,
                        })
                      }
                      disabled={toggleServiceMutation.isPending}
                      className="group flex items-center gap-2"
                    >
                      <span
                        className={`
                          relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full 
                          transition-colors duration-200 ease-in-out
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                          disabled:cursor-not-allowed disabled:opacity-50
                          ${isEnabled ? 'bg-green-500' : 'bg-gray-300'}
                        `}
                      >
                        <span
                          className={`
                            pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg 
                            ring-0 transition duration-200 ease-in-out
                            ${isEnabled ? 'translate-x-4' : 'translate-x-0.5'}
                          `}
                        />
                      </span>
                      <span
                        className={`text-sm ${isEnabled ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </button>

                    <Link
                      to={`/dashboard/services/${service.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Configure →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(!services || services.length === 0) && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No services available</p>
        </div>
      )}
    </div>
  );
}

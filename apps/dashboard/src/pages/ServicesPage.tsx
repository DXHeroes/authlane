import { Squares2X2Icon } from '@heroicons/react/16/solid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonCards } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import type { OrganizationService, Service } from '@/types';

const AUTH_TYPE_BADGES: Record<string, { label: string; tone: BadgeTone }> = {
  oauth2: { label: 'OAuth 2.0', tone: 'info' },
  api_key: { label: 'API Key', tone: 'warning' },
  none: { label: 'Public API', tone: 'success' },
};

function AuthTypeBadge({ authType }: { authType: string }) {
  const badge = AUTH_TYPE_BADGES[authType] ?? AUTH_TYPE_BADGES.none;
  return <Badge tone={badge.tone}>{badge.label}</Badge>;
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
    onSuccess: (_data, { serviceId, enabled }) => {
      queryClient.invalidateQueries({ queryKey: ['org-services'] });
      const name = services?.find((service) => service.id === serviceId)?.name ?? 'Service';
      toastSuccess(`${name} ${enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (error) => toastError(error, 'Could not change the service.'),
  });

  if (isLoading) {
    return (
      <div className="p-6 sm:p-8">
        <PageHeader title="Services" description="Configure integrations for your organization." />
        <LoadingRegion label="Loading services">
          <SkeletonCards count={3} />
        </LoadingRegion>
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
    <div className="p-6 sm:p-8">
      <PageHeader title="Services" description="Configure integrations for your organization." />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-2xl font-semibold tabular-nums">{totalServices}</div>
          <div className="text-sm text-muted-foreground">Total services</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold tabular-nums text-success">{enabledServices}</div>
          <div className="text-sm text-muted-foreground">Enabled services</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold tabular-nums text-info">{publicApiCount}</div>
          <div className="text-sm text-muted-foreground">Public APIs (no setup needed)</div>
        </Card>
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
                <Card
                  key={service.id}
                  className="p-5 transition-shadow hover:shadow-md dark:hover:border-foreground/20 dark:hover:shadow-none"
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
                      aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${service.name}`}
                      onClick={() =>
                        toggleServiceMutation.mutate({
                          serviceId: service.id,
                          enabled: !isEnabled,
                        })
                      }
                      disabled={toggleServiceMutation.isPending}
                      className="group flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={`
                          relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
                          transition-colors duration-200 ease-in-out
                          ${isEnabled ? 'bg-success' : 'bg-muted-foreground/35'}
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
                        className={`text-sm ${isEnabled ? 'font-medium text-success' : 'text-muted-foreground'}`}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </button>

                    <Link
                      to={`/dashboard/services/${service.id}`}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Configure &rarr;
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {(!services || services.length === 0) && (
        <Card className="border-dashed">
          <EmptyState icon={Squares2X2Icon} title="No services available">
            The platform catalogue is empty for this workspace. Check your deployment&apos;s
            integration configuration.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

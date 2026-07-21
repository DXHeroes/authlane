import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Connection, DashboardStats } from '@/types';

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export default function DashboardHome() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/stats'),
  });

  const { data: recentConnections, isLoading: connectionsLoading } = useQuery({
    queryKey: ['recent-connections'],
    queryFn: () => api.get<Connection[]>('/connections?limit=10'),
  });

  if (statsLoading || connectionsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const servicesEnabled = stats?.services.enabled ?? 0;
  const servicesTotal = stats?.services.total ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Overview of your Authlane integrations</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Connections"
          value={stats?.totalConnections ?? 0}
          subtitle="Active user connections"
        />
        <StatCard
          title="Active Users"
          value={stats?.activeUsers ?? 0}
          subtitle="Users with connections"
        />
        <StatCard
          title="API Calls (7 days)"
          value={(stats?.apiCalls7Days ?? 0).toLocaleString()}
          subtitle="Last 7 days"
        />
        <StatCard
          title="Enabled Services"
          value={`${servicesEnabled} / ${servicesTotal}`}
          subtitle="Available integrations"
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Recent Connections</h2>
        <div className="rounded-lg border border-border bg-card">
          {recentConnections && recentConnections.length > 0 ? (
            <div className="divide-y divide-border">
              {recentConnections.map((connection: Connection) => {
                const statusClass =
                  connection.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : connection.status === 'expired'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800';

                return (
                  <div key={connection.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{connection.serviceId}</p>
                        <p className="text-sm text-muted-foreground">User: {connection.userId}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}
                        >
                          {connection.status}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(connection.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">No connections yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

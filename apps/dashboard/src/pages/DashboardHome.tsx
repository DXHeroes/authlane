import { ArrowUpRightIcon, LinkIcon } from '@heroicons/react/16/solid';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import Badge, { connectionTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonCards, SkeletonTable } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import type { Connection, DashboardStats } from '@/types';

function StatCard({
  title,
  value,
  subtitle,
  to,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  /** A number worth showing is a number worth opening. */
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {to && (
          <ArrowUpRightIcon
            className="size-3.5 shrink-0 fill-current text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </>
  );

  if (!to) {
    return <Card className="p-5">{body}</Card>;
  }

  return (
    <Link
      to={to}
      className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {body}
    </Link>
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

  const isLoading = statsLoading || connectionsLoading;
  const servicesEnabled = stats?.services.enabled ?? 0;
  const servicesTotal = stats?.services.total ?? 0;

  if (isLoading) {
    return (
      <div className="p-6 sm:p-8">
        <PageHeader title="Dashboard" description="Overview of your Authlane integrations." />
        {/* Placeholders in the shape of the real thing, so nothing jumps when it lands. */}
        <LoadingRegion label="Loading your dashboard">
          <SkeletonCards />
          <div className="mt-8">
            <SkeletonTable rows={4} columns={3} />
          </div>
        </LoadingRegion>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <PageHeader title="Dashboard" description="Overview of your Authlane integrations." />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total connections"
          value={stats?.totalConnections ?? 0}
          subtitle="Active user connections"
          to="/dashboard/connections"
        />
        <StatCard
          title="Active users"
          value={stats?.activeUsers ?? 0}
          subtitle="Users with connections"
          to="/dashboard/connections"
        />
        <StatCard
          title="API calls (7 days)"
          value={(stats?.apiCalls7Days ?? 0).toLocaleString()}
          subtitle="Last 7 days"
        />
        <StatCard
          title="Enabled services"
          value={`${servicesEnabled} / ${servicesTotal}`}
          subtitle="Available integrations"
          to="/dashboard/services"
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="heading-tight text-lg font-semibold">Recent connections</h2>
          {recentConnections && recentConnections.length > 0 && (
            <Link
              to="/dashboard/connections"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        <Card>
          {recentConnections && recentConnections.length > 0 ? (
            <ul className="divide-y divide-border">
              {recentConnections.map((connection: Connection) => (
                <li
                  key={connection.id}
                  className="flex items-center justify-between gap-3 p-4 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{connection.serviceId}</p>
                    <p className="truncate text-muted-foreground">
                      User: {connection.externalUserId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={connectionTone(connection.status)}>{connection.status}</Badge>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {new Date(connection.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            // A first-run workspace lands here. Naming the next step matters more than the
            // empty table does.
            <EmptyState icon={LinkIcon} title="No connections yet">
              Connect an account in the <Link to="/dashboard/sandbox">Sandbox</Link> to see the
              whole flow without writing any code, or review which{' '}
              <Link to="/dashboard/services">services</Link> your workspace offers.
            </EmptyState>
          )}
        </Card>
      </section>
    </div>
  );
}

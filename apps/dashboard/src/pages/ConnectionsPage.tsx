import { LinkIcon } from '@heroicons/react/16/solid';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import ConnectionDetailModal from '@/components/ConnectionDetailModal';
import Badge, { connectionTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingRegion, SkeletonTable } from '@/components/ui/Skeleton';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { useIsCompact } from '@/lib/use-media-query';
import type { Connection, Service } from '@/types';

export default function ConnectionsPage() {
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const isCompact = useIsCompact();

  // The search term went straight into the query key, so typing an eight-character user
  // id fired eight requests and the last one to land won.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections', serviceFilter, statusFilter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (serviceFilter) params.append('service', serviceFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (debouncedSearch) params.append('userId', debouncedSearch);
      return api.get<Connection[]>(`/connections?${params.toString()}`);
    },
    // Keeps the current rows on screen while a narrower filter loads, instead of
    // blanking the table on every keystroke.
    placeholderData: keepPreviousData,
  });

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
  });

  const hasFilters = Boolean(searchQuery || serviceFilter || statusFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setServiceFilter('');
    setStatusFilter('');
  };

  const serviceName = (serviceId: string) =>
    services?.find((service) => service.id === serviceId)?.name || serviceId;

  return (
    <div className="p-6 sm:p-8">
      <PageHeader title="Connections" description="Monitor and manage all user connections." />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <TextField
          label="Search by user ID"
          type="text"
          placeholder="Enter user ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fieldClassName="flex-1 basis-64"
        />

        <SelectField
          label="Service"
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          fieldClassName="w-48"
        >
          <option value="">All services</option>
          {services?.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          fieldClassName="w-48"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="error">Error</option>
        </SelectField>
      </div>

      {/* Says how much of the data the current filters are showing, and offers the way out. */}
      <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isLoading
            ? 'Loading connections'
            : `${connections?.length ?? 0} ${connections?.length === 1 ? 'connection' : 'connections'}${hasFilters ? ' match your filters' : ''}`}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingRegion label="Loading connections">
          <SkeletonTable columns={5} />
        </LoadingRegion>
      ) : (
        <Card>
          {connections && connections.length > 0 ? (
            isCompact ? (
              <div className="divide-y divide-border">
                {connections.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => setSelectedConnection(connection)}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">{connection.externalUserId}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {serviceName(connection.serviceId)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created {new Date(connection.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge tone={connectionTone(connection.status)}>{connection.status}</Badge>
                  </button>
                ))}
              </div>
            ) : (
              <Table caption="User connections in this organization">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>User ID</Th>
                    <Th>Service</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th>Last Health Check</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {connections.map((connection) => (
                    <Tr key={connection.id}>
                      <Td className="font-mono">{connection.externalUserId}</Td>
                      <Td>{serviceName(connection.serviceId)}</Td>
                      <Td>
                        <Badge tone={connectionTone(connection.status)}>{connection.status}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {new Date(connection.createdAt).toLocaleString()}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {connection.lastHealthCheck
                          ? new Date(connection.lastHealthCheck).toLocaleString()
                          : 'Never'}
                      </Td>
                      <Td>
                        <Button
                          variant="link"
                          onClick={() => setSelectedConnection(connection)}
                          className="text-sm"
                        >
                          View details
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )
          ) : hasFilters ? (
            <EmptyState
              icon={LinkIcon}
              title="No connections match your filters"
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            >
              Widen the service or status filter, or check the user ID you searched for.
            </EmptyState>
          ) : (
            <EmptyState icon={LinkIcon} title="No connections yet">
              Connect one yourself in the <Link to="/dashboard/sandbox">Sandbox</Link> to check the
              flow end to end.
            </EmptyState>
          )}
        </Card>
      )}

      {selectedConnection && (
        <ConnectionDetailModal
          connection={selectedConnection}
          onClose={() => setSelectedConnection(null)}
        />
      )}
    </div>
  );
}

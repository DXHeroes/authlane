import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ConnectionDetailModal from '@/components/ConnectionDetailModal';
import { api } from '@/lib/api';
import type { Connection, Service } from '@/types';

export default function ConnectionsPage() {
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ['connections', serviceFilter, statusFilter, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (serviceFilter) params.append('service', serviceFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('userId', searchQuery);
      return api.get<Connection[]>(`/connections?${params.toString()}`);
    },
  });

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
  });

  const getStatusBadgeClass = (status: Connection['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Connections</h1>
        <p className="mt-2 text-muted-foreground">Monitor and manage all user connections</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-64">
          <label htmlFor="search" className="block text-sm font-medium mb-2">
            Search by User ID
          </label>
          <input
            id="search"
            type="text"
            placeholder="Enter user ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="w-48">
          <label htmlFor="service-filter" className="block text-sm font-medium mb-2">
            Service
          </label>
          <select
            id="service-filter"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Services</option>
            {services?.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-48">
          <label htmlFor="status-filter" className="block text-sm font-medium mb-2">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {connectionsLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading connections...</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          {connections && connections.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      User ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Last Health Check
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {connections.map((connection) => (
                    <tr key={connection.id} className="hover:bg-accent/50">
                      <td className="px-6 py-4 text-sm font-mono">{connection.userId}</td>
                      <td className="px-6 py-4 text-sm">
                        {services?.find((s) => s.id === connection.serviceId)?.name ||
                          connection.serviceId}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(connection.status)}`}
                        >
                          {connection.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(connection.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {connection.lastHealthCheck
                          ? new Date(connection.lastHealthCheck).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          type="button"
                          onClick={() => setSelectedConnection(connection)}
                          className="text-primary hover:underline"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              {searchQuery || serviceFilter || statusFilter
                ? 'No connections found matching your filters'
                : 'No connections yet'}
            </div>
          )}
        </div>
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

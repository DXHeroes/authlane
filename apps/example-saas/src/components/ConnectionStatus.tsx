import { useCallback, useEffect, useState } from 'react';
import { authlane, type Connection, type Service } from '@/lib/authlane';
import ConnectDialog from './ConnectDialog';

interface ConnectionWithService extends Connection {
  service?: Service;
}

export default function ConnectionStatus() {
  const [connections, setConnections] = useState<ConnectionWithService[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectDialog, setConnectDialog] = useState<{
    url: string;
    serviceName: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [connectionsRes, servicesRes] = await Promise.all([
      authlane.listConnections(),
      authlane.listServices(),
    ]);

    if (servicesRes.error) {
      setError(servicesRes.error.message);
      setLoading(false);
      return;
    }

    const serviceMap = new Map(servicesRes.data?.map((s) => [s.id, s]) ?? []);

    // Merge connections with service info
    const connectionsWithServices = (connectionsRes.data ?? []).map((conn) => ({
      ...conn,
      service: serviceMap.get(conn.serviceId),
    }));

    setServices(servicesRes.data ?? []);
    setConnections(connectionsWithServices);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConnect(serviceId: string) {
    const result = await authlane.createConnectSession(serviceId);
    if (result.data?.connectUrl) {
      setConnectDialog({
        url: result.data.connectUrl,
        serviceName: services.find((service) => service.id === serviceId)?.name ?? serviceId,
      });
    } else {
      alert(`Failed to get authorization URL: ${result.error?.message || 'Unknown error'}`);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-200 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Failed to load connections</p>
        <p className="text-sm">{error}</p>
        <button type="button" onClick={loadData} className="mt-2 text-sm underline">
          Retry
        </button>
      </div>
    );
  }

  // Group services by type
  const oauthServices = services.filter((s) => s.authType === 'oauth2');
  const publicApis = services.filter((s) => s.authType === 'none');

  return (
    <div className="space-y-6">
      {connectDialog && (
        <ConnectDialog
          connectUrl={connectDialog.url}
          serviceName={connectDialog.serviceName}
          onClose={() => setConnectDialog(null)}
          onConnected={loadData}
          onError={setError}
        />
      )}
      {/* OAuth Services */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">OAuth Services</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {oauthServices.map((service) => {
            const connection = connections.find((c) => c.serviceId === service.id);
            const isConnected = connection?.status === 'connected';

            return (
              <div
                key={service.id}
                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-sm font-bold text-gray-600">
                    {service.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{service.name}</p>
                    <p className="text-sm text-gray-500">
                      {isConnected ? (
                        <span className="text-green-600">✓ Connected</span>
                      ) : (
                        <span className="text-gray-400">Not connected</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleConnect(service.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isConnected
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isConnected ? 'Reconnect' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Public APIs */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Public APIs (No Auth Needed)</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {publicApis.map((service) => (
            <div
              key={service.id}
              className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-sm font-bold text-green-700">
                  {service.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{service.name}</p>
                  <p className="text-sm text-green-600">✓ Always available</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-center pt-4">
        <button
          type="button"
          onClick={loadData}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          ↻ Refresh connections
        </button>
      </div>
    </div>
  );
}

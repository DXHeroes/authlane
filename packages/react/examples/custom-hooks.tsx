/**
 * Example using custom hooks
 */

import React, { useState } from 'react';
import {
  AuthlaneProvider,
  useAuthlane,
  useConnection,
  useConnections,
} from '@authlane/react';

function GitHubConnectionStatus() {
  const { connection, status, isLoading, disconnect, refetch } = useConnection({
    serviceId: 'github',
    autoFetch: true,
  });

  if (isLoading) {
    return <div>Loading GitHub connection...</div>;
  }

  if (status === 'connected') {
    return (
      <div>
        <h3>GitHub Connected</h3>
        <p>Connected at: {new Date(connection!.createdAt).toLocaleString()}</p>
        <button onClick={disconnect}>Disconnect</button>
        <button onClick={refetch}>Refresh</button>
      </div>
    );
  }

  return <div>GitHub not connected</div>;
}

function AllConnections() {
  const { connections, isLoading, refetch } = useConnections({
    autoFetch: true,
    pollInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return <div>Loading connections...</div>;
  }

  return (
    <div>
      <h3>All Connections ({connections.length})</h3>
      <button onClick={refetch}>Refresh All</button>
      <ul>
        {connections.map((conn) => (
          <li key={conn.serviceId}>
            {conn.serviceId} - Connected at {new Date(conn.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectApiAccess() {
  const { client, userId } = useAuthlane();
  const [loading, setLoading] = useState(false);

  const handleFetchConnections = async () => {
    setLoading(true);
    const { data, error } = await client.connections.list({ userId });

    if (error) {
      console.error('Error:', error);
      alert(`Error: ${error.message}`);
    } else {
      console.log('Connections:', data);
      alert(`Found ${data?.length || 0} connections`);
    }

    setLoading(false);
  };

  return (
    <div>
      <h3>Direct API Access</h3>
      <button onClick={handleFetchConnections} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch Connections via SDK'}
      </button>
    </div>
  );
}

export default function App() {
  const currentUser = {
    id: 'user_123',
  };

  return (
    <AuthlaneProvider
      publicKey={process.env.AUTHLANE_PUBLIC_KEY!}
      userId={currentUser.id}
    >
      <div style={{ padding: '20px' }}>
        <h1>Custom Hooks Example</h1>

        <GitHubConnectionStatus />
        <hr />

        <AllConnections />
        <hr />

        <DirectApiAccess />
      </div>
    </AuthlaneProvider>
  );
}

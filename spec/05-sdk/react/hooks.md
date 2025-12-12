# React SDK Hooks Reference

Complete reference for all React hooks provided by the Authlane React SDK.

## useAuthlane

Access the Authlane context.

```tsx
import { useAuthlane } from '@authlane/react';

function Component() {
  const {
    userId,
    setUserId,
    isReady,
  } = useAuthlane();

  return <div>User: {userId}</div>;
}
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `userId` | `string \| null` | Current user ID |
| `setUserId` | `(id: string) => void` | Set the user ID |
| `isReady` | `boolean` | SDK is initialized |

---

## useServices

Fetch available services.

```tsx
import { useServices } from '@authlane/react';

function ServicesList() {
  const { services, isLoading, error, refetch } = useServices();

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {services.map(service => (
        <li key={service.id}>
          <img src={service.config.icon} alt="" />
          {service.name}
        </li>
      ))}
    </ul>
  );
}
```

### Options

```tsx
const { services } = useServices({
  enabled?: boolean;     // Enable/disable the query
  authType?: 'oauth2' | 'api_key' | 'none';  // Filter by auth type
});
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `services` | `Service[]` | List of services |
| `isLoading` | `boolean` | Loading state |
| `error` | `ApiError \| null` | Error if any |
| `refetch` | `() => void` | Refetch data |

---

## useConnections

Fetch user's connections.

```tsx
import { useConnections } from '@authlane/react';

function ConnectionsList() {
  const { connections, isLoading, error, refetch } = useConnections();

  return (
    <div>
      <h2>Your Connections</h2>
      {connections.map(conn => (
        <div key={conn.id}>
          {conn.serviceId}: {conn.status}
        </div>
      ))}
    </div>
  );
}
```

### Options

```tsx
const { connections } = useConnections({
  status?: 'pending' | 'connected' | 'expired' | 'error';
  serviceId?: string;
  enabled?: boolean;
});
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `connections` | `Connection[]` | List of connections |
| `isLoading` | `boolean` | Loading state |
| `error` | `ApiError \| null` | Error if any |
| `refetch` | `() => void` | Refetch data |
| `pagination` | `Pagination` | Pagination info |

---

## useConnection

Fetch a specific connection.

```tsx
import { useConnection } from '@authlane/react';

function GitHubConnection() {
  const { connection, isLoading, isConnected } = useConnection('github');

  if (isLoading) return <Spinner />;

  if (!isConnected) {
    return <ConnectButton serviceId="github" />;
  }

  return (
    <div>
      <span>✓ Connected</span>
      <span>Expires: {connection.expiresAt}</span>
    </div>
  );
}
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `connection` | `Connection \| null` | Connection data |
| `isLoading` | `boolean` | Loading state |
| `isConnected` | `boolean` | Connection exists and active |
| `isExpired` | `boolean` | Connection is expired |
| `error` | `ApiError \| null` | Error if any |
| `refetch` | `() => void` | Refetch data |

---

## useConnect

Handle OAuth connection flow.

```tsx
import { useConnect } from '@authlane/react';

function ConnectButton({ serviceId }: { serviceId: string }) {
  const { connect, isConnecting, error } = useConnect();

  const handleConnect = async () => {
    const result = await connect(serviceId);
    if (result.success) {
      console.log('Connected!');
    }
  };

  return (
    <button onClick={handleConnect} disabled={isConnecting}>
      {isConnecting ? 'Connecting...' : 'Connect'}
    </button>
  );
}
```

### Options

```tsx
const { connect } = useConnect({
  mode?: 'redirect' | 'popup';  // Default: 'popup'
  popupOptions?: {
    width?: number;   // Default: 600
    height?: number;  // Default: 700
  };
  onSuccess?: (connection: Connection) => void;
  onError?: (error: ApiError) => void;
});
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `connect` | `(serviceId: string, options?) => Promise<Result>` | Start connection |
| `isConnecting` | `boolean` | Connection in progress |
| `error` | `ApiError \| null` | Error if any |

### connect() Options

```tsx
await connect('github', {
  scope?: 'user' | 'organization';
  redirectUri?: string;
  scopes?: string[];  // Additional OAuth scopes
});
```

---

## useDisconnect

Handle disconnection.

```tsx
import { useDisconnect } from '@authlane/react';

function DisconnectButton({ serviceId }: { serviceId: string }) {
  const { disconnect, isDisconnecting } = useDisconnect();

  const handleDisconnect = async () => {
    const confirmed = window.confirm('Disconnect this service?');
    if (confirmed) {
      await disconnect(serviceId);
    }
  };

  return (
    <button onClick={handleDisconnect} disabled={isDisconnecting}>
      {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
    </button>
  );
}
```

### Options

```tsx
const { disconnect } = useDisconnect({
  revokeToken?: boolean;  // Revoke at provider (default: true)
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
});
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `disconnect` | `(serviceId: string) => Promise<void>` | Disconnect service |
| `isDisconnecting` | `boolean` | Disconnection in progress |
| `error` | `ApiError \| null` | Error if any |

---

## useTools

Fetch available tools for user.

```tsx
import { useTools } from '@authlane/react';

function ToolsList() {
  const { tools, isLoading } = useTools();

  return (
    <div>
      <h2>Available Tools</h2>
      {tools.map(tool => (
        <div key={tool.name}>
          <strong>{tool.name}</strong>
          <p>{tool.description}</p>
        </div>
      ))}
    </div>
  );
}
```

### Options

```tsx
const { tools } = useTools({
  serviceId?: string;  // Filter by service
  format?: 'mcp' | 'openai';  // Tool format
  enabled?: boolean;
});
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `tools` | `Tool[]` | List of tools |
| `isLoading` | `boolean` | Loading state |
| `error` | `ApiError \| null` | Error if any |
| `refetch` | `() => void` | Refetch data |

---

## useConnectionStatus

Real-time connection status.

```tsx
import { useConnectionStatus } from '@authlane/react';

function ConnectionIndicator({ serviceId }: { serviceId: string }) {
  const { status, isHealthy, lastChecked } = useConnectionStatus(serviceId);

  return (
    <div className={`indicator ${isHealthy ? 'green' : 'red'}`}>
      {status}
      <small>Checked: {lastChecked?.toLocaleTimeString()}</small>
    </div>
  );
}
```

### Options

```tsx
const { status } = useConnectionStatus(serviceId, {
  pollInterval?: number;  // Check interval in ms (default: 30000)
  enabled?: boolean;
});
```

### Returns

| Property | Type | Description |
|----------|------|-------------|
| `status` | `string` | Connection status |
| `isHealthy` | `boolean` | Connection is working |
| `isChecking` | `boolean` | Health check in progress |
| `lastChecked` | `Date \| null` | Last check time |
| `checkNow` | `() => void` | Trigger immediate check |

---

## Combining Hooks

```tsx
function ServiceCard({ service }: { service: Service }) {
  const { connection, isConnected, isExpired } = useConnection(service.id);
  const { connect, isConnecting } = useConnect();
  const { disconnect, isDisconnecting } = useDisconnect();

  return (
    <div className="service-card">
      <img src={service.config.icon} alt={service.name} />
      <h3>{service.name}</h3>

      {isConnected && !isExpired && (
        <div>
          <span className="badge green">Connected</span>
          <button onClick={() => disconnect(service.id)} disabled={isDisconnecting}>
            Disconnect
          </button>
        </div>
      )}

      {isExpired && (
        <div>
          <span className="badge yellow">Expired</span>
          <button onClick={() => connect(service.id)}>
            Reconnect
          </button>
        </div>
      )}

      {!isConnected && !isExpired && (
        <button onClick={() => connect(service.id)} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      )}
    </div>
  );
}
```


# @authlane/react

React components and hooks for [Authlane](https://authlane.com) - OAuth connections for AI agents and SaaS applications.

## Installation

```bash
npm install @authlane/react
# or
pnpm add @authlane/react
# or
yarn add @authlane/react
```

## Quick Start

```tsx
import { AuthlaneProvider, ConnectionButton, ConnectionList } from '@authlane/react';

function App() {
  return (
    <AuthlaneProvider
      publicKey="pk_..."
      userId={currentUser.id}
    >
      <div>
        <h1>Connect Your Services</h1>

        {/* Connect button */}
        <ConnectionButton
          service="github"
          onSuccess={(connection) => {
            console.log('Connected!', connection);
          }}
          onError={(error) => {
            console.error('Failed to connect:', error);
          }}
        >
          Connect GitHub
        </ConnectionButton>

        {/* List all connections */}
        <ConnectionList
          onDisconnect={(serviceId) => {
            console.log('Disconnected from', serviceId);
          }}
        />
      </div>
    </AuthlaneProvider>
  );
}
```

## Components

### AuthlaneProvider

Provider component that wraps your application and provides Authlane context.

```tsx
<AuthlaneProvider
  publicKey="pk_..."
  userId="user_123"
  baseUrl="https://api.authlane.com" // optional
>
  {children}
</AuthlaneProvider>
```

**Props:**
- `publicKey` (string, required): Your Authlane public API key
- `userId` (string, required): Current user's ID
- `baseUrl` (string, optional): Authlane API base URL (defaults to `https://api.authlane.com`)
- `fetch` (function, optional): Custom fetch implementation

### ConnectionButton

Button component for initiating OAuth connection flow.

```tsx
<ConnectionButton
  service="github"
  mode="popup" // or "redirect"
  onSuccess={(connection) => {}}
  onError={(error) => {}}
  className="my-button"
  scopes={['repo', 'user:email']}
>
  Connect GitHub
</ConnectionButton>
```

**Props:**
- `service` (string, required): Service ID (e.g., 'github', 'slack')
- `mode` ('popup' | 'redirect', optional): OAuth flow mode (defaults to 'popup')
- `onSuccess` (function, optional): Callback on successful connection
- `onError` (function, optional): Callback on error
- `className` (string, optional): Custom CSS class
- `children` (ReactNode, optional): Button content (defaults to "Connect {service}")
- `redirectUrl` (string, optional): Redirect URL for OAuth callback (required for redirect mode)
- `scopes` (string[], optional): Additional OAuth scopes
- `disabled` (boolean, optional): Disabled state

### ConnectionList

Component for displaying all user connections with status and disconnect functionality.

```tsx
<ConnectionList
  onDisconnect={(serviceId) => {}}
  className="my-list"
  services={['github', 'slack']} // filter by services
  allowDisconnect={true}
  emptyState={<div>No connections yet</div>}
/>
```

**Props:**
- `onDisconnect` (function, optional): Callback when user disconnects a service
- `className` (string, optional): Custom CSS class
- `services` (string[], optional): Show only specific services
- `allowDisconnect` (boolean, optional): Enable/disable disconnect button (defaults to true)
- `emptyState` (ReactNode, optional): Custom empty state

## Hooks

### useAuthlane

Access Authlane SDK client.

```tsx
import { useAuthlane } from '@authlane/react';

function MyComponent() {
  const { client, userId } = useAuthlane();

  const handleGetConnections = async () => {
    const { data, error } = await client.connections.list({ userId });
    // ...
  };

  return <button onClick={handleGetConnections}>Get Connections</button>;
}
```

### useConnection

Manage a single service connection.

```tsx
import { useConnection } from '@authlane/react';

function GitHubStatus() {
  const { connection, status, disconnect, refetch } = useConnection({
    serviceId: 'github',
    autoFetch: true,
    pollInterval: 30000, // refresh every 30s
  });

  if (status === 'connected') {
    return (
      <div>
        Connected to GitHub
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return <div>Not connected</div>;
}
```

**Options:**
- `serviceId` (string, required): Service ID
- `autoFetch` (boolean, optional): Auto-fetch connection on mount (defaults to true)
- `pollInterval` (number, optional): Poll interval in milliseconds

**Returns:**
- `connection`: Connection object or null
- `status`: Connection status ('connected' | 'disconnected' | 'expired' | 'error')
- `isLoading`: Loading state
- `error`: Error object or null
- `refetch`: Function to refetch connection
- `disconnect`: Function to disconnect

### useConnections

Manage all user connections.

```tsx
import { useConnections } from '@authlane/react';

function ConnectionsList() {
  const { connections, isLoading, refetch } = useConnections({
    autoFetch: true,
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={refetch}>Refresh</button>
      {connections.map(conn => (
        <div key={conn.serviceId}>{conn.serviceId}</div>
      ))}
    </div>
  );
}
```

**Options:**
- `autoFetch` (boolean, optional): Auto-fetch connections on mount (defaults to true)
- `pollInterval` (number, optional): Poll interval in milliseconds

**Returns:**
- `connections`: Array of connections
- `isLoading`: Loading state
- `error`: Error object or null
- `refetch`: Function to refetch connections

## Utilities

### OAuth Utilities

Low-level utilities for OAuth flow (advanced usage).

```tsx
import {
  generateAuthorizeUrl,
  startOAuthPopupFlow,
  startOAuthRedirectFlow,
  parseOAuthCallback,
} from '@authlane/react';

// Generate OAuth authorize URL
const url = generateAuthorizeUrl({
  baseUrl: 'https://api.authlane.com',
  userId: 'user_123',
  serviceId: 'github',
  scopes: ['repo'],
});

// Start OAuth popup flow
const callbackData = await startOAuthPopupFlow({
  baseUrl: 'https://api.authlane.com',
  userId: 'user_123',
  serviceId: 'github',
});

// Start OAuth redirect flow
startOAuthRedirectFlow({
  baseUrl: 'https://api.authlane.com',
  userId: 'user_123',
  serviceId: 'github',
  redirectUrl: 'https://myapp.com/callback',
});

// Parse OAuth callback from URL
const callbackData = parseOAuthCallback();
```

## Styling

The components come with minimal default styling. You can customize them using CSS classes:

```css
/* Connection Button */
.authlane-connection-button {
  padding: 10px 20px;
  border-radius: 4px;
  background: #0070f3;
  color: white;
  border: none;
  cursor: pointer;
}

.authlane-connection-button--loading {
  opacity: 0.6;
  cursor: not-allowed;
}

.authlane-connection-button--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Connection List */
.authlane-connection-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.authlane-connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
}

.authlane-connection-item__service {
  font-weight: 600;
}

.authlane-connection-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.authlane-connection-status--connected {
  background: #d4edda;
  color: #155724;
}

.authlane-connection-status--expired {
  background: #fff3cd;
  color: #856404;
}

.authlane-connection-status--error {
  background: #f8d7da;
  color: #721c24;
}
```

## TypeScript

This package is written in TypeScript and includes type definitions.

```tsx
import type {
  AuthlaneConfig,
  ConnectionStatus,
  OAuthMode,
  ConnectionButtonProps,
  ConnectionListProps,
} from '@authlane/react';
```

## Examples

See the [examples directory](./examples) for more examples:
- Basic usage
- Custom styling
- Next.js integration
- Advanced OAuth flows

## License

MIT

## Links

- [Documentation](https://docs.authlane.com)
- [GitHub](https://github.com/authlane/authlane)
- [NPM](https://www.npmjs.com/package/@authlane/react)

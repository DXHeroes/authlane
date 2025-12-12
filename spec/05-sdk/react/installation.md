# React SDK Installation

Install and configure the Authlane React SDK for client-side integration.

## Installation

```bash
# npm
npm install @authlane/react

# yarn
yarn add @authlane/react

# pnpm
pnpm add @authlane/react
```

## Requirements

- React 18.0.0 or later
- TypeScript 4.7+ (recommended)

## Basic Setup

### Wrap Your App with AuthlaneProvider

```tsx
// app/layout.tsx (Next.js App Router)
import { AuthlaneProvider } from '@authlane/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <AuthlaneProvider
          apiUrl="https://api.authlane.com"
          userId={currentUser?.id}
        >
          {children}
        </AuthlaneProvider>
      </body>
    </html>
  );
}
```

### Provider Configuration

```tsx
interface AuthlaneProviderProps {
  // Required
  apiUrl: string;              // Your Authlane API URL

  // Optional
  userId?: string;             // Current user ID (can be set later)
  sessionToken?: string;       // For authenticated requests
  onError?: (error: ApiError) => void;  // Global error handler
  onConnect?: (connection: Connection) => void;  // Connection callback
  onDisconnect?: (serviceId: string) => void;    // Disconnection callback
}
```

## Framework Integration

### Next.js (App Router)

```tsx
// app/providers.tsx
'use client';

import { AuthlaneProvider } from '@authlane/react';
import { useSession } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <AuthlaneProvider
      apiUrl={process.env.NEXT_PUBLIC_AUTHLANE_URL!}
      userId={session?.user?.id}
    >
      {children}
    </AuthlaneProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Next.js (Pages Router)

```tsx
// pages/_app.tsx
import { AuthlaneProvider } from '@authlane/react';
import { useSession } from 'next-auth/react';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  const { data: session } = useSession();

  return (
    <AuthlaneProvider
      apiUrl={process.env.NEXT_PUBLIC_AUTHLANE_URL!}
      userId={session?.user?.id}
    >
      <Component {...pageProps} />
    </AuthlaneProvider>
  );
}
```

### Vite + React

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthlaneProvider } from '@authlane/react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthlaneProvider
      apiUrl={import.meta.env.VITE_AUTHLANE_URL}
    >
      <App />
    </AuthlaneProvider>
  </React.StrictMode>
);
```

### Create React App

```tsx
// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthlaneProvider } from '@authlane/react';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <AuthlaneProvider
      apiUrl={process.env.REACT_APP_AUTHLANE_URL!}
    >
      <App />
    </AuthlaneProvider>
  </React.StrictMode>
);
```

## Setting User ID Dynamically

```tsx
import { useAuthlane } from '@authlane/react';

function LoginCallback() {
  const { setUserId } = useAuthlane();

  useEffect(() => {
    // After user logs in
    const user = getCurrentUser();
    setUserId(user.id);
  }, []);

  return <div>Logging in...</div>;
}
```

## Environment Variables

```bash
# .env.local (Next.js)
NEXT_PUBLIC_AUTHLANE_URL=https://api.authlane.com

# .env (Vite)
VITE_AUTHLANE_URL=https://api.authlane.com

# .env (CRA)
REACT_APP_AUTHLANE_URL=https://api.authlane.com
```

## TypeScript Configuration

The SDK includes TypeScript definitions. Recommended settings:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "ES2020"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Verifying Installation

```tsx
import { useServices } from '@authlane/react';

function VerifyInstallation() {
  const { services, isLoading, error } = useServices();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Installation successful!</h2>
      <p>Available services: {services.length}</p>
    </div>
  );
}
```

## Next Steps

- [AuthlaneProvider](./provider.md)
- [Hooks Reference](./hooks.md)
- [Components](./components.md)
- [Examples](./examples.md)


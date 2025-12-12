# Frontend Technology Stack

This document describes the frontend technologies used in Authlane's applications.

## Overview

Authlane uses a modern, lightweight frontend stack focused on performance and developer experience.

## Core Technologies

### React 19

The dashboard and widgets are built with React 19.

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

Key React 19 features used:
- Server Components (where applicable)
- Concurrent rendering
- Automatic batching
- Transitions

### Tailwind CSS

Styling is handled entirely with Tailwind CSS.

```json
{
  "devDependencies": {
    "tailwindcss": "^3.x",
    "postcss": "^8.x",
    "autoprefixer": "^10.x"
  }
}
```

Benefits:
- Utility-first approach
- No runtime CSS-in-JS overhead
- Consistent design system
- Tree-shaking for minimal bundle size

### Utility Libraries

```json
{
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0"
  }
}
```

- **clsx**: Conditional class name construction
- **tailwind-merge**: Intelligent Tailwind class merging

## State Management

### TanStack Query

Server state management uses TanStack Query (React Query).

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.62.11"
  }
}
```

Used for:
- API data fetching
- Caching
- Background refetching
- Optimistic updates

### No Global State Library

The application does not use a global state library (Redux, Zustand, etc.). State is managed through:
- React Context for shared state
- TanStack Query for server state
- Component state for local UI state

## Routing

### React Router v7

```json
{
  "dependencies": {
    "react-router-dom": "^7.1.3"
  }
}
```

Features used:
- File-based routing patterns
- Nested layouts
- Route loaders
- Error boundaries

## Authentication

### better-auth

Authentication in the dashboard uses better-auth.

```json
{
  "dependencies": {
    "better-auth": "^1.4.3"
  }
}
```

Features:
- Session management
- OAuth provider support
- Secure cookie handling
- CSRF protection

## Build Tool

### Vite

All frontend apps use Vite for development and building.

```json
{
  "devDependencies": {
    "vite": "^6.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

Benefits:
- Fast HMR (Hot Module Replacement)
- ESM-native development
- Optimized production builds
- Plugin ecosystem

## UI Component Library

### No Radix UI

Authlane **does not use Radix UI** as a component library. The UI is built with:

1. **Custom components** built with React and Tailwind CSS
2. **Utility classes** for consistent styling
3. **Native HTML elements** with proper accessibility attributes

If you see `@radix-ui` packages in `pnpm-lock.yaml`, they are transitive dependencies from other packages, not directly used components.

### Component Patterns

```tsx
// Example: Custom Button component
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded font-medium transition-colors',
        {
          'bg-blue-600 text-white hover:bg-blue-700': variant === 'primary',
          'bg-gray-200 text-gray-800 hover:bg-gray-300': variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
        },
        {
          'px-2 py-1 text-sm': size === 'sm',
          'px-4 py-2': size === 'md',
          'px-6 py-3 text-lg': size === 'lg',
        }
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

## Dashboard Architecture

```
apps/dashboard/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   ├── pages/            # Route components
│   │   ├── Dashboard.tsx
│   │   ├── Services.tsx
│   │   ├── Connections.tsx
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useConnections.ts
│   │   └── ...
│   ├── lib/              # Utilities and configurations
│   │   ├── api.ts
│   │   └── authlane.ts
│   ├── App.tsx           # Main app component
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles (Tailwind)
├── public/               # Static assets
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Example SaaS Integration

The example-saas app demonstrates how to integrate Authlane into a frontend application:

```tsx
// apps/example-saas/src/lib/authlane.ts
import { Authlane } from '@authlane/sdk';

export const authlane = new Authlane({
  apiKey: import.meta.env.VITE_AUTHLANE_API_KEY,
});
```

```tsx
// apps/example-saas/src/pages/GitHubPage.tsx
import { useConnections } from '@authlane/react';

export function GitHubPage() {
  const { connections, isLoading } = useConnections();

  const githubConnection = connections?.find(
    c => c.serviceId === 'github'
  );

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!githubConnection || githubConnection.status !== 'connected') {
    return <ConnectGitHubButton />;
  }

  return <GitHubReposList />;
}
```

## Performance Considerations

1. **Bundle Size**: Tailwind CSS with purging keeps CSS minimal
2. **Code Splitting**: React Router enables route-based splitting
3. **Lazy Loading**: Components loaded on demand
4. **Caching**: TanStack Query provides intelligent caching
5. **No CSS-in-JS Runtime**: Pure CSS approach eliminates runtime overhead

## Accessibility

The frontend follows WCAG 2.1 guidelines:

- Semantic HTML elements
- ARIA attributes where needed
- Keyboard navigation support
- Focus management
- Color contrast compliance
- Screen reader compatibility

## Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Firefox | 90+ |
| Safari | 14+ |
| Edge | 90+ |

Note: Internet Explorer is not supported.


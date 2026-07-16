# @authlane/react

React embed for Authlane's hosted connection UI.

## Install

```bash
pnpm add @authlane/react
```

Create a short-lived connect session with `@authlane/sdk` on your SaaS backend. Pass only the returned URL to the browser:

```tsx
import { AuthlaneConnect } from '@authlane/react';

export function IntegrationSettings({ connectUrl }: { connectUrl: string }) {
  return (
    <AuthlaneConnect
      connectUrl={connectUrl}
      minHeight={480}
      onEvent={(event) => {
        if (event.type === 'connected') {
          console.log(`${event.serviceId} connected`);
        }
      }}
    />
  );
}
```

## Props

- `connectUrl` — required short-lived URL returned by `connectSessions.create`
- `title` — iframe title; defaults to `Connect services`
- `className` — optional iframe class
- `minHeight` — minimum iframe height in pixels; defaults to `400`
- `onEvent` — receives `connected`, `disconnected`, and `error` events

The component validates both the `postMessage` origin and iframe source, applies an iframe sandbox, and follows trusted resize messages. It never accepts an API key or external user ID.

## Security boundary

Never create a connect session in browser code. Your backend must bind the external user, exact allowed origin, allowed services, and short expiry before returning the URL.

## License

MIT

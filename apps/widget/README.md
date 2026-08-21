# Authlane Connection Widget

Embeddable widget for managing OAuth connections to third-party services.

## Features

### Service Selector
- Grid view of available services with icons
- Filter by category (communication, CRM, development, productivity, storage)
- Search functionality across service names and descriptions
- Visual connection status badges

### OAuth Flow Handler
- Secure popup-based OAuth flow
- Automatic callback handling
- Error state management
- Loading and success states

### Connection Status
- Connected/Disconnected/Expired badges with color coding
- Automatic expiration detection
- One-click reconnect functionality
- Connection expiry date display

### Iframe Wrapper
- Fully embeddable via iframe
- PostMessage API for parent-child communication
- Customizable styling via CSS variables
- Automatic height adjustment
- Sandbox security

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

The widget will be available at `http://localhost:3003`

## Build

```bash
pnpm build
```

Generates:
- `dist/authlane-widget.iife.js` - For direct script tag usage
- `dist/authlane-widget.es.js` - For ES module imports
- `dist/authlane-widget.css` - Widget styles

## Usage

### Basic Implementation

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="authlane-widget.css">
</head>
<body>
  <div id="authlane-widget"></div>

  <script src="authlane-widget.iife.js"></script>
  <script>
    const widget = new AuthlaneWidget({
      apiUrl: 'https://app.authlane.io',
      apiKey: 'your-api-key',
      userId: 'user-123',
      onConnect: (serviceId) => {
        console.log('Connected:', serviceId);
      },
      onDisconnect: (serviceId) => {
        console.log('Disconnected:', serviceId);
      },
      onError: (error) => {
        console.error('Error:', error);
      }
    });

    const instance = widget.mount('authlane-widget');
  </script>
</body>
</html>
```

### ES Module Usage

```javascript
import { AuthlaneWidget } from '@authlane/widget';

const widget = new AuthlaneWidget({
  apiUrl: 'https://app.authlane.io',
  apiKey: 'your-api-key',
  userId: 'user-123'
});

const instance = widget.mount('container-id');
```

### Customization

```javascript
const widget = new AuthlaneWidget({
  apiUrl: 'https://app.authlane.io',
  apiKey: 'your-api-key',
  userId: 'user-123',
  theme: {
    primaryColor: '#3b82f6',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif'
  },
  services: ['slack', 'github', 'google'], // Optional: filter specific services
  onConnect: (serviceId) => {
    // Handle connection
  },
  onDisconnect: (serviceId) => {
    // Handle disconnection
  },
  onError: (error) => {
    // Handle errors
  }
});

const instance = widget.mount('container-id');
```

### Widget Instance Methods

```javascript
// Show the widget
instance.open();

// Hide the widget
instance.close();

// Update configuration
instance.updateConfig({
  theme: {
    primaryColor: '#8b5cf6'
  }
});

// Destroy the widget
instance.destroy();
```

## PostMessage API

### Messages from Widget to Parent

```typescript
// Widget is ready
{ type: 'widget:ready' }

// Widget height changed
{ type: 'widget:resize', height: number }

// User initiated connection
{ type: 'widget:connect', serviceId: string }

// Connection successful
{ type: 'widget:connected', serviceId: string, connectionId: string }

// User disconnected service
{ type: 'widget:disconnect', serviceId: string }

// Service disconnected
{ type: 'widget:disconnected', serviceId: string }

// Error occurred
{ type: 'widget:error', error: string }
```

### Messages from Parent to Widget

```typescript
// Send configuration
{ type: 'parent:config', config: WidgetConfig }

// Update theme
{ type: 'parent:theme', theme: WidgetTheme }
```

## CSS Variables

Customize the widget appearance using CSS variables:

```css
:root {
  --primary-color: #3b82f6;
  --primary-hover: #2563eb;
  --background-color: #ffffff;
  --background-secondary: #f9fafb;
  --text-color: #1f2937;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
  --border-radius: 8px;
  --font-family: system-ui, sans-serif;

  --success-color: #10b981;
  --success-bg: #d1fae5;
  --warning-color: #f59e0b;
  --warning-bg: #fef3c7;
  --error-color: #ef4444;
  --error-bg: #fee2e2;
}
```

## API Requirements

The widget expects the following API endpoints:

### GET /integrations
Returns available integrations:
```json
{
  "integrations": [
    {
      "id": "slack",
      "name": "Slack",
      "category": "communication",
      "icon": "https://...",
      "description": "Team communication platform"
    }
  ]
}
```

### GET /connections?userId={userId}
Returns user connections:
```json
{
  "connections": [
    {
      "id": "conn-123",
      "serviceId": "slack",
      "userId": "user-123",
      "status": "connected",
      "expiresAt": "2025-12-31T23:59:59Z",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### GET /oauth/{serviceId}/authorize
Initiates OAuth flow. Should redirect to service OAuth page.

Query parameters:
- `userId`: User identifier
- `redirect_uri`: Callback URL

### DELETE /connections/{connectionId}
Deletes a connection.

## Example

See `public/example.html` for a complete working example.

## License

MIT

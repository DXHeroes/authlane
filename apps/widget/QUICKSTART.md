# Authlane Widget - Quick Start Guide

## Installation

From the repository root:

```bash
pnpm install
```

## Development

Start the development server:

```bash
pnpm --filter @authlane/widget dev
```

The widget will be available at http://localhost:3003

View the example at http://localhost:3003/example.html

## Build

Build the production bundle:

```bash
pnpm --filter @authlane/widget build
```

This creates:
- `dist/authlane-widget.iife.js` - For `<script>` tags
- `dist/authlane-widget.es.js` - For ES modules
- `dist/authlane-widget.css` - Widget styles

## Embedding the Widget

### Option 1: Script Tag (Simplest)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="path/to/authlane-widget.css">
</head>
<body>
  <div id="authlane-widget"></div>

  <script src="path/to/authlane-widget.iife.js"></script>
  <script>
    const widget = new AuthlaneWidget({
      apiUrl: 'http://localhost:3000',
      apiKey: 'your-api-key',
      userId: 'user-123',
      onConnect: (serviceId) => {
        console.log('Connected to:', serviceId);
      }
    });

    const instance = widget.mount('authlane-widget');
  </script>
</body>
</html>
```

### Option 2: ES Module

```javascript
import { AuthlaneWidget } from '@authlane/widget';
import '@authlane/widget/dist/authlane-widget.css';

const widget = new AuthlaneWidget({
  apiUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
  userId: 'user-123'
});

const instance = widget.mount('container-id');
```

## Configuration Options

```typescript
interface WidgetConfig {
  // Required
  apiUrl: string;        // Your API base URL
  apiKey: string;        // Authentication API key
  userId: string;        // Current user ID

  // Optional
  theme?: {
    primaryColor?: string;      // Default: '#3b82f6'
    backgroundColor?: string;   // Default: '#ffffff'
    textColor?: string;        // Default: '#1f2937'
    borderRadius?: string;     // Default: '8px'
    fontFamily?: string;       // Default: 'system-ui, sans-serif'
  };

  services?: string[];   // Filter to specific service IDs

  // Callbacks
  onConnect?: (serviceId: string) => void;
  onDisconnect?: (serviceId: string) => void;
  onError?: (error: Error) => void;
}
```

## Widget Instance Methods

```javascript
const instance = widget.mount('container-id');

// Show widget
instance.open();

// Hide widget
instance.close();

// Update configuration
instance.updateConfig({
  theme: {
    primaryColor: '#8b5cf6'
  }
});

// Clean up
instance.destroy();
```

## Customizing Theme

### Via Configuration

```javascript
new AuthlaneWidget({
  apiUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
  userId: 'user-123',
  theme: {
    primaryColor: '#8b5cf6',    // Purple
    backgroundColor: '#1f2937',  // Dark gray
    textColor: '#f9fafb',       // Light gray
    borderRadius: '12px',       // Rounded
    fontFamily: 'Inter, sans-serif'
  }
});
```

### Via CSS Variables

```css
:root {
  --primary-color: #8b5cf6;
  --background-color: #1f2937;
  --text-color: #f9fafb;
  --border-radius: 12px;
}
```

## Testing Locally

1. Start the API server (port 3000):
```bash
pnpm --filter @authlane/api dev
```

2. Start the widget dev server (port 3003):
```bash
pnpm --filter @authlane/widget dev
```

3. Open http://localhost:3003/example.html

## API Requirements

Your API must provide these endpoints:

**GET /integrations**
```json
{
  "integrations": [
    {
      "id": "slack",
      "name": "Slack",
      "category": "communication",
      "icon": "https://...",
      "description": "Team communication"
    }
  ]
}
```

**GET /connections?userId={userId}**
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

**GET /oauth/{serviceId}/authorize**
- Redirects to OAuth provider
- Params: `userId`, `redirect_uri`

**DELETE /connections/{connectionId}**
- Removes connection

## Common Issues

### Popup Blocked
Users need to allow popups for your domain. The widget detects and displays an error message.

### CORS Errors
Ensure your API includes proper CORS headers:
```javascript
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, Content-Type
```

### Styling Issues
Make sure to include the CSS file:
```html
<link rel="stylesheet" href="authlane-widget.css">
```

## Next Steps

- Read the full README.md for detailed documentation
- Check public/example.html for a complete working example

## Support

For issues or questions, check the main repository documentation.

# AI Assistant Hub - Example SaaS Application

This is an example SaaS application that demonstrates how to integrate with **Authlane** for managing third-party service connections.

## Features

- **Connection Status** - View and manage service connections
- **GitHub Integration Demo** - Fetch repositories using OAuth credentials from Authlane
- **Public API Demo** - Call JSONPlaceholder API (no authentication needed)

## How to Run

1. Make sure the Authlane API is running:
   ```bash
   pnpm dev
   ```

2. Open the example SaaS app at: **http://localhost:5174**

3. Open the Authlane dashboard at: **http://localhost:5173**

## How Authlane Integration Works

### 1. Configuration (in Authlane Dashboard)
- Enable services your SaaS needs
- Configure OAuth credentials for each service

### 2. Connection (from Example SaaS)
- Users click "Connect" to authorize services
- OAuth flow opens in a popup
- Authlane stores credentials securely

### 3. Usage (in your application)
- Fetch credentials from Authlane API
- Call external APIs directly with the tokens
- Authlane handles token refresh automatically

## Code Structure

```
src/
├── lib/
│   └── authlane.ts      # Authlane API client
├── components/
│   └── ConnectionStatus.tsx  # Service connection UI
├── pages/
│   ├── HomePage.tsx     # Dashboard with connections
│   ├── GitHubPage.tsx   # GitHub integration demo
│   └── PostsPage.tsx    # Public API demo
└── App.tsx              # Main app with routing
```

## Key Integration Points

### Getting Credentials

```typescript
import { authlane } from './lib/authlane'

// Get OAuth access token
const { data, error } = await authlane.getCredentials('github')
if (data?.accessToken) {
  // Use the token to call GitHub API directly
  fetch('https://api.github.com/user/repos', {
    headers: { Authorization: `Bearer ${data.accessToken}` }
  })
}
```

### Starting OAuth Flow

```typescript
// Get authorization URL
const { data } = await authlane.getAuthUrl('github')
if (data?.url) {
  // Open in popup or redirect
  window.open(data.url, '_blank')
}
```

### Listing Available Services

```typescript
const { data: services } = await authlane.listServices()
// Returns: [{ id: 'github', name: 'GitHub', authType: 'oauth2', ... }]
```

## Configuration

Edit `src/lib/authlane.ts` to configure:

- `AUTHLANE_API_URL` - API endpoint (default: `http://localhost:3000/api/v1`)
- `AUTHLANE_API_KEY` - Your API key from Authlane dashboard
- `USER_ID` - Your SaaS user's identifier

## Port

This application runs on port **5174** by default to avoid conflicts with:
- Authlane API: 3000
- Authlane Dashboard: 5173
- Authlane Docs: 3004









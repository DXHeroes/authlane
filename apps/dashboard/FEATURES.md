# Authlane Dashboard - Features Documentation

## Overview

The Authlane Dashboard is a React-based admin interface for managing OAuth connections, API keys, and tenant settings.

---

## Features

### 1. Dashboard Home (`/dashboard`)

**Description:** Overview page with key metrics and recent activity

**Key Metrics:**
- Total Connections
- Active Users
- API Calls (Last 7 Days)
- Enabled Services

**Components:**
- Stats cards with real-time data
- Recent connections timeline
- Quick links to other sections

---

### 2. Connections Monitoring (`/dashboard/connections`)

**Description:** Monitor and manage all user OAuth connections

**Features:**
- **Filtering:**
  - By Service (dropdown)
  - By Status (active/expired/error)
  - By User ID (search input)

- **Table View:**
  - User ID (searchable)
  - Service name
  - Connection status (color-coded badge)
  - Created timestamp
  - Last health check timestamp
  - Actions: View Details

- **Connection Detail Modal:**
  - Full connection metadata
  - **Secure Credentials Preview:**
    - Toggle show/hide
    - Masked tokens (first 4 + last 4 chars visible)
    - Access token, refresh token
    - Expiration time
    - OAuth scopes (as badges)
    - Custom metadata (JSON)

**Use Cases:**
- Monitor connection health across all users
- Debug connection issues
- Identify expired connections
- Search for specific user connections
- View credential details securely

---

### 3. Services Configuration (`/dashboard/services`)

**Description:** Configure available OAuth integrations

**Features:**
- List of all available services
- Enable/disable integrations
- Custom OAuth app configuration
- Service details page with:
  - OAuth configuration (client ID, client secret)
  - Required scopes
  - Callback URLs
  - Integration status

---

### 4. API Keys Management (`/dashboard/api-keys`)

**Description:** Manage programmatic access to Authlane API

**Features:**
- **API Key Listing:**
  - Key name (user-defined)
  - Key prefix (e.g., `ak_test_abcd••••••••`)
  - Created timestamp
  - Last used timestamp
  - Expiration date (with expired indicator)
  - Revoke action

- **Create API Key:**
  - Two-step modal flow:
    1. Creation form (name, optional expiration)
    2. Success view (shows full key **only once**)
  - **Copy to Clipboard** with visual feedback
  - Warning banner: "Save this key now!"

- **Revoke API Key:**
  - Confirmation dialog
  - Immediate revocation
  - Query invalidation for instant UI update

**Security Notes:**
- Keys shown in full only once during creation
- Prefix-only display in list view
- Revocation is immediate and irreversible
- Best practices shown on page

---

### 5. Settings (`/dashboard/settings`)

**Description:** Configure tenant-wide settings and integrations

**Sections:**

#### Webhook Configuration
- **Webhook URL:** Where Authlane sends events
- **Webhook Secret:** For verifying webhook signatures
  - Generate button (creates cryptographically secure secret)
  - Monospace display

**Webhook Events:**
- Connection created
- Connection expired
- Connection deleted
- Token refreshed
- Connection error

#### Rate Limit Configuration
- **Requests per Minute:** API rate limit per tenant
- **Requests per Hour:** Hourly rate limit
- **Requests per Day:** Daily rate limit

**Notes:**
- Validated to ensure reasonable limits
- Applied per tenant ID
- Affects all API endpoints

#### Custom Domain (Coming Soon)
- Custom domain for OAuth callbacks
- Custom domain for API endpoints
- Currently disabled (future feature)

**Form Controls:**
- Save Settings (with loading state)
- Reset (reverts to loaded values)
- Success/error messages
- Last updated timestamp

---

## Navigation Structure

```
Dashboard
├── Dashboard (Home)           - Overview & stats
├── Connections                - User connection monitoring
├── Services                   - OAuth integration configuration
├── API Keys                   - Programmatic access management
└── Settings                   - Tenant-wide settings
```

---

## Security Features

### Credentials Protection
1. **Masked Display:** Tokens show only `abc1••••••••xyz9`
2. **Lazy Loading:** Credentials fetched only on user request
3. **One-Time Display:** API keys shown in full only once
4. **Secure Generation:** Webhook secrets use `crypto.getRandomValues()`

### Access Control
- All routes protected by authentication
- JWT token required for API calls
- Tenant isolation at API level
- Row-level security in database

---

## API Integration

### Authentication
Dashboard API calls use an HttpOnly, Secure, SameSite session cookie. Machine API keys and provider
credential leases must never enter dashboard JavaScript or browser storage.

### Endpoints

**Dashboard:**
- `GET /api/v1/dashboard/stats`

**Connections:**
- `GET /api/v1/connections?service={service}&status={status}&userId={userId}`
- Credential material is intentionally unavailable to the dashboard

**Services:**
- `GET /api/v1/services`
- `GET /api/v1/services/{id}`
- `PUT /api/v1/services/{id}`

**API Keys:**
- `GET /api/v1/api-keys`
- `POST /api/v1/api-keys` - Body: `{ name: string, expiresInDays?: number }`
- `DELETE /api/v1/api-keys/{id}`

**Settings:**
- `GET /api/v1/settings`
- `PUT /api/v1/settings` - Body: `Partial<TenantSettings>`

---

## State Management

### React Query
- **Caching:** 5-minute stale time
- **Background Updates:** Disabled on window focus
- **Optimistic Updates:** For mutations
- **Query Invalidation:** After successful mutations

### Local State
- Form inputs (controlled components)
- Modal visibility
- Copy success indicators
- Filter values

---

## Styling

### Design System
- **Framework:** Tailwind CSS
- **Color Palette:**
  - Primary: Blue (buttons, links)
  - Secondary: Gray (secondary actions)
  - Success: Green (active status)
  - Warning: Yellow (expired status)
  - Error: Red (error status, destructive actions)
  - Muted: Gray (labels, help text)

### Components
- **Buttons:** Primary, secondary, destructive
- **Inputs:** Text, number, URL, select
- **Badges:** Status indicators (rounded pills)
- **Cards:** White background with border
- **Tables:** Striped rows, hover effects
- **Modals:** Overlay with backdrop blur

---

## Responsive Design

### Breakpoints
- **Mobile:** < 640px (stacked layout)
- **Tablet:** 640px - 1024px (2-column grid)
- **Desktop:** > 1024px (4-column grid)

### Mobile Optimizations
- Hamburger menu (not yet implemented)
- Scrollable tables on small screens
- Full-width modals
- Touch-friendly button sizes

---

## Accessibility

### Implemented
- ✅ Semantic HTML (`<nav>`, `<table>`, `<button>`)
- ✅ ARIA labels on icon buttons
- ✅ Keyboard navigation (tab order)
- ✅ Focus indicators
- ✅ Form labels associated with inputs

### Future Improvements
- [ ] Screen reader announcements for dynamic content
- [ ] ARIA live regions for status updates
- [ ] High contrast mode support
- [ ] Keyboard shortcuts

---

## Browser Support

### Minimum Requirements
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Required Features
- `navigator.clipboard` API (HTTPS required)
- `crypto.getRandomValues()` API
- ES2020+ JavaScript features
- CSS Grid and Flexbox

---

## Performance

### Bundle Size
- **Main Bundle:** ~262 KB (78 KB gzipped)
- **CSS:** ~15 KB (3.5 KB gzipped)

### Optimization Strategies
- Code splitting by route
- React Query caching
- Lazy component loading (modals)
- Debounced search inputs

### Metrics
- **First Contentful Paint (FCP):** < 1s
- **Time to Interactive (TTI):** < 2s
- **Lighthouse Score:** 90+ (target)

---

## Development

### Local Setup
```bash
cd apps/dashboard
pnpm install
pnpm dev
```

### Build for Production
```bash
pnpm build
pnpm preview
```

### Type Checking
```bash
pnpm type-check
```

### Environment Variables
```env
VITE_API_URL=http://localhost:3000/api/v1
```

---

## Testing

### Manual Testing Checklist
- [ ] Login/logout flow
- [ ] Dashboard stats display correctly
- [ ] Connections filtering works
- [ ] Connection detail modal shows data
- [ ] Credentials masking works
- [ ] API key creation shows key once
- [ ] Copy to clipboard works
- [ ] API key revocation requires confirmation
- [ ] Settings form validates and saves
- [ ] Webhook secret generation works
- [ ] Navigation between pages

### Automated Tests (Future)
- Unit tests for components
- Integration tests for flows
- E2E tests for critical paths

---

## Troubleshooting

### Common Issues

**Issue:** API calls fail with 401 Unauthorized
- **Solution:** Check if JWT token is valid and not expired

**Issue:** Clipboard copy doesn't work
- **Solution:** Ensure site is served over HTTPS

**Issue:** Connections don't load
- **Solution:** Check API endpoint and network tab

**Issue:** Build fails with TypeScript errors
- **Solution:** Run `pnpm type-check` to see specific errors

---

## Future Enhancements

### Planned Features
- [ ] Real-time updates via WebSockets
- [ ] Bulk actions (delete multiple connections)
- [ ] Export data (CSV, JSON)
- [ ] Advanced filtering (date range, multiple services)
- [ ] Connection health monitoring graphs
- [ ] Audit log viewer
- [ ] User management (for multi-user tenants)
- [ ] Custom webhook event configuration
- [ ] API usage analytics dashboard

### UI/UX Improvements
- [ ] Dark mode support
- [ ] Customizable dashboard widgets
- [ ] Keyboard shortcuts
- [ ] Command palette (Cmd+K)
- [ ] Notification center
- [ ] Toast notifications

---

## Support

For issues or questions:
- GitHub Issues: [authlane/issues](https://github.com/authlane/authlane/issues)
- Documentation: [docs.authlane.com](https://docs.authlane.com)
- Email: support@authlane.com

---

*Last Updated: November 27, 2025*

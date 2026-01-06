# Authlane E2E Tests

Comprehensive end-to-end tests covering all user scenarios and features of the Authlane platform.

## Quick Start

### Starting All Services

Before running E2E tests, you need to start all Authlane services:

```bash
# 1. Clone the repository (if you haven't already)
git clone <repository-url>
cd authlane

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Set up the database
pnpm --filter @authlane/database migrate
pnpm --filter @authlane/database seed

# 5. Start all services in development mode
pnpm dev
```

This will start all services on the following ports:
- **API**: http://localhost:3000
- **Dashboard**: http://localhost:5173
- **Landing**: http://localhost:3002
- **Widget**: http://localhost:3003
- **Docs**: http://localhost:3004
- **Example SaaS**: http://localhost:5174

Wait until all services are running (you should see console output indicating each service has started).

### Running E2E Tests

Once all services are running, open a new terminal and run the tests:

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test file
pnpm test:e2e e2e/smoke.spec.ts

# Run with UI (interactive mode)
pnpm test:e2e --ui

# Run in headed mode (see browser)
pnpm test:e2e --headed
```

### Important Notes

- **All services must be running** before executing E2E tests
- Tests will **gracefully skip** if a required service is not available
- If tests are failing, verify all services are running with `pnpm dev`
- Check that ports 3000, 5173, 3002, 3003, 3004, and 5174 are not in use by other applications

## Test Coverage

### 1. **smoke.spec.ts** - Health Checks
- API health endpoint
- Landing page loads
- Dashboard loads
- Widget loads
- Documentation loads
- Cross-app navigation

### 2. **auth.spec.ts** - Authentication Flows
- User registration
- Email validation
- Password strength requirements
- User login
- Invalid credentials handling
- Logout functionality
- Protected routes

### 3. **organization.spec.ts** - Organization Management
- Default organization creation
- Create new organizations
- Switch between organizations
- Update organization settings
- View organization members
- Invite members (form validation)

### 4. **services.spec.ts** - Service Management
- View services list
- Services grouped by auth type (OAuth2, API Key, Public)
- Enable/disable services via toggle
- Navigate to service detail page
- View OAuth configuration
- View API info for public services

### 5. **oauth-flow.spec.ts** - OAuth Authentication Flow ⭐ NEW
- Initiate OAuth authorization
- OAuth callback handling
- Connection creation
- Connection status updates
- OAuth error handling (denial, invalid state)
- Connection management (disconnect)
- OAuth scopes and permissions
- Token refresh

### 6. **api-keys.spec.ts** - API Keys Management ⭐ NEW
- Create API keys
- List API keys with metadata
- Masked key display
- Copy key to clipboard
- Update API key name and expiration
- Revoke API keys
- Confirmation dialogs
- Use API keys for authentication
- Reject invalid/revoked keys

### 7. **tool-execution.spec.ts** - Integration Tool Execution ⭐ NEW
- List available tools via API
- Tool filtering by service
- Execute tools with parameters
- Parameter validation
- Tool execution results
- Execution history
- Error handling
- Security (organization scoping)
- Sensitive parameter redaction
- Performance (timeouts, concurrent execution)

### 8. **multi-tenancy.spec.ts** - Multi-Tenancy Isolation ⭐ NEW
- Isolated API keys per organization
- Isolated connections per organization
- Organization switching
- Data visibility changes on org switch
- Member access control
- Cross-organization access prevention

### 9. **user-journeys.spec.ts** - Complete User Scenarios ⭐ NEW
Complete end-to-end workflows:
1. **New User Onboarding** - Registration → Explore services → View documentation
2. **OAuth Integration Setup** - Setup GitHub OAuth connection
3. **API Development Workflow** - Create API key → Make first API call → View docs
4. **Team Collaboration** - Invite members → Set up org settings
5. **Multi-Service Integration** - Enable multiple services → Create API key
6. **Production Deployment** - Production API key → Security review
7. **Error Recovery** - Handle connection errors → Access help

### 10. **widget.spec.ts** - Widget Integration ⭐ NEW
- Widget loads successfully
- Services display
- Connection status indicators
- User interactions (connect/disconnect)
- Iframe embedding
- Parent-widget communication (postMessage)
- Theme customization
- Error handling
- Accessibility (keyboard nav, ARIA labels)
- Performance (load time, bundle size)

### 11. **security-errors.spec.ts** - Security & Error Handling ⭐ NEW
**Rate Limiting:**
- Excessive API requests
- Login attempts
- API key creation

**Authentication Security:**
- Password not exposed in responses
- HttpOnly cookies
- Weak password rejection
- Protected route access

**Authorization:**
- Cross-user data access prevention
- Cross-organization access prevention

**Input Validation:**
- HTML/XSS sanitization
- Email format validation
- SQL injection prevention

**Error Messages:**
- No sensitive data leakage
- User-friendly messages
- Network error handling

**Additional Security:**
- CORS headers
- Data encryption in transit
- API key hashing
- Session expiration
- Session invalidation on logout

### 12. **example-saas.spec.ts** - Example SaaS App
- Home page loads
- Connection status component
- Navigation between pages
- GitHub demo page
- Posts page with API data
- Authlane integration

## Running Tests

### Prerequisites

```bash
# 1. Install dependencies
pnpm install

# 2. Start all services
pnpm dev

# 3. (Optional) Seed database
pnpm --filter @authlane/database seed
```

### Run All Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI (interactive mode)
pnpm test:e2e --ui

# Run in headed mode (see browser)
pnpm test:e2e --headed
```

### Run Specific Test Files

```bash
# Smoke tests (quick health checks)
pnpm test:e2e e2e/smoke.spec.ts

# Authentication tests
pnpm test:e2e e2e/auth.spec.ts

# OAuth flow tests
pnpm test:e2e e2e/oauth-flow.spec.ts

# API keys management
pnpm test:e2e e2e/api-keys.spec.ts

# Tool execution
pnpm test:e2e e2e/tool-execution.spec.ts

# Multi-tenancy isolation
pnpm test:e2e e2e/multi-tenancy.spec.ts

# User journeys
pnpm test:e2e e2e/user-journeys.spec.ts

# Widget integration
pnpm test:e2e e2e/widget.spec.ts

# Security & errors
pnpm test:e2e e2e/security-errors.spec.ts
```

### Run Specific Test Suites

```bash
# Run only OAuth flow tests
pnpm test:e2e e2e/oauth-flow.spec.ts --grep "OAuth Flow"

# Run only API key creation tests
pnpm test:e2e e2e/api-keys.spec.ts --grep "API Key Creation"

# Run only security tests
pnpm test:e2e e2e/security-errors.spec.ts --grep "Security"
```

### Debug Tests

```bash
# Run with debug mode
DEBUG=pw:api pnpm test:e2e

# Run with trace
pnpm test:e2e --trace on

# Run with video recording
pnpm test:e2e --video on
```

## Test Organization

### Test Structure

Each test file follows this structure:

```typescript
test.describe('Feature Name', () => {
  test.describe('Sub-feature', () => {
    test('specific behavior', async ({ page }) => {
      // Test implementation
    });
  });
});
```

### Utilities

Common utilities are in `e2e/utils.ts`:

- `generateTestUser()` - Generate unique test user credentials
- `registerAndLogin()` - Register and login helper
- `login()` - Login with existing credentials
- `logout()` - Logout current user
- `waitForDashboard()` - Wait for dashboard to load
- `navigateToServices()` - Navigate to services page
- `navigateToOrganization()` - Navigate to organization settings
- `createOrganization()` - Create new organization
- `expectToast()` - Assert toast/notification message

### URLs

All URLs are centralized in `e2e/utils.ts`:

```typescript
const URLS = {
  dashboard: 'http://localhost:5173',
  api: 'http://localhost:3000',
  landing: 'http://localhost:3002',
  widget: 'http://localhost:3003',
  docs: 'http://localhost:3004',
  exampleSaas: 'http://localhost:5174',
};
```

## Environment Variables

Set these for testing:

```bash
# Test API key (optional)
export TEST_API_KEY=your_test_api_key

# CI mode (optional)
export CI=true
```

## Test Reports

After running tests, view the HTML report:

```bash
pnpm test:e2e --reporter=html

# Open report
open playwright-report/index.html
```

## Test Coverage Summary

| Category | Tests | Status |
|----------|-------|--------|
| **Basic Functionality** | ✅ | Covered |
| - Health checks | 9 tests | ✅ |
| - Authentication | 14 tests | ✅ |
| - Organization management | 13 tests | ✅ |
| - Services management | 12 tests | ✅ |
| **Advanced Features** | ✅ | Covered |
| - OAuth flow | 22 tests | ⭐ NEW |
| - API keys management | 35 tests | ⭐ NEW |
| - Tool execution | 30 tests | ⭐ NEW |
| - Multi-tenancy | 18 tests | ⭐ NEW |
| **User Experience** | ✅ | Covered |
| - User journeys | 7 scenarios | ⭐ NEW |
| - Widget integration | 24 tests | ⭐ NEW |
| - Example SaaS app | 11 tests | ✅ |
| **Security** | ✅ | Covered |
| - Rate limiting | 3 tests | ⭐ NEW |
| - Authentication security | 4 tests | ⭐ NEW |
| - Authorization | 2 tests | ⭐ NEW |
| - Input validation | 3 tests | ⭐ NEW |
| - Error handling | 3 tests | ⭐ NEW |
| - CORS/CSRF | 2 tests | ⭐ NEW |
| - Data encryption | 2 tests | ⭐ NEW |
| - Session security | 2 tests | ⭐ NEW |

**Total: ~200+ comprehensive E2E tests**

## Best Practices

1. **Test Isolation** - Each test should be independent and not rely on other tests
2. **Cleanup** - Tests clean up after themselves (delete created resources)
3. **Realistic Scenarios** - Tests simulate real user behavior
4. **Error Handling** - Tests verify both success and error cases
5. **Security** - Tests verify security controls are working
6. **Performance** - Tests include timeout and performance checks
7. **Accessibility** - Tests include basic accessibility checks

## Troubleshooting

### Tests are failing

1. **Check services are running**:
   ```bash
   pnpm dev
   ```

2. **Check database is seeded**:
   ```bash
   pnpm --filter @authlane/database seed
   ```

3. **Check ports are available**:
   - Dashboard: 5173
   - API: 3000
   - Landing: 3002
   - Widget: 3003
   - Docs: 3004
   - Example SaaS: 5174

4. **Clear browser state**:
   ```bash
   rm -rf playwright/.auth
   ```

### Tests are slow

1. Run in headless mode (default)
2. Reduce timeout in `playwright.config.ts`
3. Run tests in parallel (when supported)
4. Run only specific test files

### Tests are flaky

1. Increase timeouts in `playwright.config.ts`
2. Add more explicit waits (`waitForLoadState`, `waitForSelector`)
3. Use retry mechanism in CI

## Contributing

When adding new features:

1. Add E2E tests for the new feature
2. Follow existing test structure
3. Add tests to appropriate category
4. Update this README with new tests
5. Ensure tests pass before committing

## CI/CD Integration

Tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run E2E Tests
  run: |
    pnpm install
    pnpm dev &
    sleep 10
    pnpm test:e2e
```

## Performance Benchmarks

Target performance metrics:

- **Smoke tests**: < 30 seconds
- **Authentication tests**: < 2 minutes
- **Full suite**: < 15 minutes
- **Individual test**: < 30 seconds

## Contact

For questions or issues with E2E tests, contact the development team or create an issue in the repository.

# @authlane/email

Email sending utilities for Authlane using [Resend](https://resend.com) and [React Email](https://react.email) templates.

## Features

- Pre-built email templates for common authentication flows
- Type-safe API with TypeScript support
- Integration with better-auth hooks
- Beautiful, responsive email designs

## Installation

This package is included in the Authlane monorepo. To use it in other packages:

```json
{
  "dependencies": {
    "@authlane/email": "workspace:*"
  }
}
```

## Configuration

Set the following environment variables:

```bash
# Required: Resend API key
RESEND_API_KEY=re_your_api_key

# Optional: Sender address (default: Authlane <noreply@authlane.dev>)
EMAIL_FROM=Your App <noreply@yourdomain.com>

# Optional: Application URL for links (default: http://localhost:5173)
APP_URL=https://your-app-url.com
```

## Usage

### Send Organization Invitation

```typescript
import { sendOrganizationInvitation } from '@authlane/email';

await sendOrganizationInvitation('user@example.com', {
  inviterName: 'John Doe',
  organizationName: 'Acme Inc',
  inviteLink: 'https://app.example.com/accept-invitation/abc123',
  role: 'member',
  expiresIn: '48 hours',
});
```

### Send Email Verification

```typescript
import { sendEmailVerification } from '@authlane/email';

await sendEmailVerification('user@example.com', {
  userName: 'Jane',
  verificationLink: 'https://app.example.com/verify-email?token=xyz',
  expiresIn: '24 hours',
});
```

### Send Password Reset

```typescript
import { sendPasswordReset } from '@authlane/email';

await sendPasswordReset('user@example.com', {
  userName: 'Jane',
  resetLink: 'https://app.example.com/reset-password?token=xyz',
  expiresIn: '1 hour',
});
```

### Send Welcome Email

```typescript
import { sendWelcomeEmail } from '@authlane/email';

await sendWelcomeEmail('user@example.com', {
  userName: 'Jane',
  organizationName: 'Acme Inc',
  dashboardLink: 'https://app.example.com/dashboard',
  role: 'member',
});
```

## Email Templates

| Template | Description | Trigger |
|----------|-------------|---------|
| `OrganizationInvitation` | Invitation to join an organization | `organization.inviteMember()` |
| `EmailVerification` | Verify email address | Sign-up or manual trigger |
| `PasswordReset` | Reset password link | Forgot password flow |
| `WelcomeEmail` | Welcome after joining | After invitation accepted |

## Preview Templates

To preview email templates locally:

```bash
cd packages/email
pnpm email:dev
```

This starts the React Email development server at `http://localhost:3001`.

## API Reference

### `sendOrganizationInvitation(to, props)`

Send an organization invitation email.

**Parameters:**
- `to` (string): Recipient email address
- `props` (OrganizationInvitationProps): Template properties

### `sendEmailVerification(to, props)`

Send an email verification email.

**Parameters:**
- `to` (string): Recipient email address
- `props` (EmailVerificationProps): Template properties

### `sendPasswordReset(to, props)`

Send a password reset email.

**Parameters:**
- `to` (string): Recipient email address
- `props` (PasswordResetProps): Template properties

### `sendWelcomeEmail(to, props)`

Send a welcome email after joining an organization.

**Parameters:**
- `to` (string): Recipient email address
- `props` (WelcomeEmailProps): Template properties

## Return Value

All send functions return:

```typescript
interface EmailResult {
  success: boolean;
  messageId?: string;  // Resend message ID if successful
  error?: string;      // Error message if failed
}
```

## Error Handling

The package uses graceful error handling:

```typescript
const result = await sendOrganizationInvitation('user@example.com', props);

if (!result.success) {
  console.error('Failed to send email:', result.error);
}
```

## License

Elastic License 2.0 (ELv2)









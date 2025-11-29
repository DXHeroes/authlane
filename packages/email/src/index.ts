/**
 * @authlane/email
 * Email sending utilities using Resend and react-email templates
 */

// Client exports
export {
  createEmailClient,
  getEmailClient,
  getEmailConfig,
  type EmailConfig,
} from './client';

// Send function exports
export {
  sendOrganizationInvitation,
  sendEmailVerification,
  sendPasswordReset,
  sendWelcomeEmail,
  type EmailResult,
} from './send';

// Template exports for customization
export {
  OrganizationInvitation,
  type OrganizationInvitationProps,
  EmailVerification,
  type EmailVerificationProps,
  PasswordReset,
  type PasswordResetProps,
  WelcomeEmail,
  type WelcomeEmailProps,
} from './templates';


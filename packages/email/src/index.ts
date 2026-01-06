/**
 * @authlane/email
 * Email sending utilities using Resend and react-email templates
 */

// Client exports
export {
  createEmailClient,
  type EmailConfig,
  getEmailClient,
  getEmailConfig,
} from './client';

// Send function exports
export {
  type EmailResult,
  sendEmailVerification,
  sendOrganizationInvitation,
  sendPasswordReset,
  sendWelcomeEmail,
} from './send';

// Template exports for customization
export {
  EmailVerification,
  type EmailVerificationProps,
  OrganizationInvitation,
  type OrganizationInvitationProps,
  PasswordReset,
  type PasswordResetProps,
  WelcomeEmail,
  type WelcomeEmailProps,
} from './templates';





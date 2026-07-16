/**
 * Email Sending Functions
 * High-level functions for sending different types of emails
 */

import { getEmailClient, getEmailConfig } from './client.js';
import {
  EmailVerification,
  type EmailVerificationProps,
  OrganizationInvitation,
  type OrganizationInvitationProps,
  PasswordReset,
  type PasswordResetProps,
  WelcomeEmail,
  type WelcomeEmailProps,
} from './templates/index.js';

/**
 * Result type for email operations
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends an organization invitation email
 * @param to Recipient email address
 * @param props Template properties
 */
export async function sendOrganizationInvitation(
  to: string,
  props: OrganizationInvitationProps
): Promise<EmailResult> {
  try {
    const client = getEmailClient();
    const config = getEmailConfig();

    const { data, error } = await client.emails.send({
      from: config.fromAddress,
      to,
      subject: `You've been invited to join ${props.organizationName}`,
      react: <OrganizationInvitation {...props} />,
    });

    if (error) {
      console.error('[Email] Failed to send organization invitation:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Organization invitation sent:', data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending organization invitation:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Sends an email verification email
 * @param to Recipient email address
 * @param props Template properties
 */
export async function sendEmailVerification(
  to: string,
  props: EmailVerificationProps
): Promise<EmailResult> {
  try {
    const client = getEmailClient();
    const config = getEmailConfig();

    const { data, error } = await client.emails.send({
      from: config.fromAddress,
      to,
      subject: 'Verify your email address',
      react: <EmailVerification {...props} />,
    });

    if (error) {
      console.error('[Email] Failed to send email verification:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Email verification sent:', data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending email verification:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Sends a password reset email
 * @param to Recipient email address
 * @param props Template properties
 */
export async function sendPasswordReset(
  to: string,
  props: PasswordResetProps
): Promise<EmailResult> {
  try {
    const client = getEmailClient();
    const config = getEmailConfig();

    const { data, error } = await client.emails.send({
      from: config.fromAddress,
      to,
      subject: 'Reset your password',
      react: <PasswordReset {...props} />,
    });

    if (error) {
      console.error('[Email] Failed to send password reset:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Password reset email sent:', data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending password reset:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Sends a welcome email after joining an organization
 * @param to Recipient email address
 * @param props Template properties
 */
export async function sendWelcomeEmail(to: string, props: WelcomeEmailProps): Promise<EmailResult> {
  try {
    const client = getEmailClient();
    const config = getEmailConfig();

    const { data, error } = await client.emails.send({
      from: config.fromAddress,
      to,
      subject: `Welcome to ${props.organizationName}!`,
      react: <WelcomeEmail {...props} />,
    });

    if (error) {
      console.error('[Email] Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Welcome email sent:', data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending welcome email:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

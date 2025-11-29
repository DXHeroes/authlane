/**
 * Resend Email Client
 * Provides a configured Resend client instance for sending emails
 */

import { Resend } from 'resend';

/**
 * Environment configuration for email service
 */
export interface EmailConfig {
  apiKey: string;
  fromAddress: string;
  appUrl: string;
}

/**
 * Gets the email configuration from environment variables
 * @throws Error if required environment variables are missing
 */
export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM || 'Authlane <noreply@authlane.dev>';
  const appUrl = process.env.APP_URL || 'http://localhost:5173';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is required');
  }

  return {
    apiKey,
    fromAddress,
    appUrl,
  };
}

/**
 * Creates a new Resend client instance
 * @param apiKey Optional API key, defaults to RESEND_API_KEY env var
 */
export function createEmailClient(apiKey?: string): Resend {
  const key = apiKey || process.env.RESEND_API_KEY;
  
  if (!key) {
    throw new Error('RESEND_API_KEY environment variable is required');
  }
  
  return new Resend(key);
}

/**
 * Singleton Resend client instance
 * Lazily initialized on first access
 */
let clientInstance: Resend | null = null;

/**
 * Gets the singleton Resend client instance
 */
export function getEmailClient(): Resend {
  if (!clientInstance) {
    clientInstance = createEmailClient();
  }
  return clientInstance;
}


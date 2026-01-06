/**
 * Better Auth Configuration
 * Provides authentication with organization support and future SSO capability
 */

import type { Database } from '@authlane/database';
import {
  sendEmailVerification,
  sendOrganizationInvitation,
  sendPasswordReset,
  sendWelcomeEmail,
} from '@authlane/email';
import bcrypt from 'bcrypt';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';

/**
 * Gets the application URL from environment
 */
function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:5173';
}

/**
 * Checks if email sending is enabled (RESEND_API_KEY is set)
 */
function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Creates a Better Auth instance with organization support
 * @param db Drizzle database instance
 * @param options Configuration options
 * @returns Better Auth instance
 */
export function createAuth(
  db: Database,
  options?: {
    baseURL?: string;
    trustedOrigins?: string[];
  }
) {
  const appUrl = getAppUrl();
  const emailEnabled = isEmailEnabled();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
    }),

    // Base URL for auth endpoints
    baseURL: options?.baseURL || process.env.BETTER_AUTH_URL || 'http://localhost:3000',

    // Trusted origins for CORS
    trustedOrigins:
      options?.trustedOrigins ||
      [
        'http://localhost:3000',
        'http://localhost:5173',
        ...(process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) || []),
      ].filter(Boolean),

    // Email verification configuration
    emailVerification: emailEnabled
      ? {
          sendVerificationEmail: async ({ user, url }) => {
            console.log('[Auth] Sending email verification to:', user.email);
            await sendEmailVerification(user.email, {
              userName: user.name || undefined,
              verificationLink: url,
              expiresIn: '24 hours',
            });
          },
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
        }
      : undefined,

    // Email + password authentication
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: emailEnabled, // Enable when email provider is configured
      // Use bcrypt for password hashing (compatible with our seed script)
      password: {
        hash: async (password) => {
          return await bcrypt.hash(password, 10);
        },
        verify: async ({ hash, password }) => {
          return await bcrypt.compare(password, hash);
        },
      },
      // Password reset email
      sendResetPassword: emailEnabled
        ? async ({ user, url }) => {
            console.log('[Auth] Sending password reset to:', user.email);
            await sendPasswordReset(user.email, {
              userName: user.name || undefined,
              resetLink: url,
              expiresIn: '1 hour',
            });
          }
        : undefined,
    },

    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },

    // Plugins
    plugins: [
      organization({
        // Allow users to create organizations
        allowUserToCreateOrganization: true,

        // Creator gets owner role
        creatorRole: 'owner',

        // Maximum organizations per user
        organizationLimit: 10,

        // Maximum members per organization
        membershipLimit: 100,

        // Invitation expires in 48 hours
        invitationExpiresIn: 60 * 60 * 48,

        // Send invitation email when member is invited
        sendInvitationEmail: emailEnabled
          ? async (data) => {
              const inviteLink = `${appUrl}/accept-invitation/${data.id}`;
              console.log('[Auth] Sending organization invitation to:', data.email);

              await sendOrganizationInvitation(data.email, {
                inviterName: data.inviter.user.name || data.inviter.user.email,
                organizationName: data.organization.name,
                inviteLink,
                role: data.role,
                expiresIn: '48 hours',
              });
            }
          : undefined,

        // Callback when invitation is accepted
        onInvitationAccepted: emailEnabled
          ? async (data: {
              id: string;
              role: string;
              organization: { id: string; name: string };
              invitation: { id: string; email: string };
              inviter: { user: { id: string; name: string | null; email: string } };
              acceptedUser: { id: string; name: string | null; email: string };
            }) => {
              // Send welcome email to the new member
              console.log(
                '[Auth] Invitation accepted, sending welcome email to:',
                data.acceptedUser.email
              );

              await sendWelcomeEmail(data.acceptedUser.email, {
                userName: data.acceptedUser.name || 'there',
                organizationName: data.organization.name,
                dashboardLink: `${appUrl}/dashboard`,
                role: data.role,
              });
            }
          : undefined,
      }),

      // SSO plugin can be added here later:
      // sso({
      //   providers: ["oidc", "saml"]
      // })
    ],

    // Advanced options
    advanced: {
      // Enable cross-subdomain cookies for multi-tenant setup
      crossSubDomainCookies: {
        enabled: process.env.NODE_ENV === 'production',
      },
    },
  });
}

// Type export for use in other modules
export type Auth = ReturnType<typeof createAuth>;

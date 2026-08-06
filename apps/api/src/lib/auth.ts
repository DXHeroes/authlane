/**
 * Better Auth Configuration
 * Provides authentication with organization support and future SSO capability
 */

import type { Database } from '@authlane/database';
import {
  type EmailResult,
  sendEmailVerification,
  sendMagicLink,
  sendOrganizationInvitation,
  sendPasswordReset,
  sendWelcomeEmail,
} from '@authlane/email';
import { hashUserPassword, verifyUserPassword } from '@authlane/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization, twoFactor } from 'better-auth/plugins';
import { buildInvitationLink, getAppUrl } from './app-url.js';
import { requireEmailDelivery } from './auth-email-delivery.js';
import {
  type AuthSecondaryStorage,
  shouldStoreAuthSessionsInDatabase,
} from './auth-secondary-storage.js';
import {
  type AuthMode,
  authModeConfiguration,
  isSignUpEnabled,
  parseAuthMode,
  parseAuthSecrets,
  validateMagicLinkEmailConfiguration,
  validateTrustedOrigins,
} from './auth-security-config.js';
import { createOidcProviderPlugin, oidcProviderRateLimitRules } from './oidc-provider-config.js';

export interface Auth {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(options: { headers: Headers }): Promise<{
      user: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        image?: string | null;
        createdAt: Date;
        updatedAt: Date;
        twoFactorEnabled?: boolean | null;
      };
      session: {
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
        createdAt: Date;
        updatedAt: Date;
        ipAddress?: string | null;
        userAgent?: string | null;
        activeOrganizationId?: string | null;
      };
    } | null>;
  };
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
    authMode?: AuthMode;
    baseURL?: string;
    signUpEnabled?: boolean;
    sendMagicLinkEmail?: (email: string, url: string) => Promise<EmailResult>;
    trustedOrigins?: string[];
    secondaryStorage?: AuthSecondaryStorage;
  }
): Auth {
  const appUrl = getAppUrl();
  const emailEnabled = isEmailEnabled();
  const environment = process.env.NODE_ENV || 'development';
  const authMode = options?.authMode ?? parseAuthMode(process.env.AUTHLANE_AUTH_MODE);
  const signUpEnabled =
    options?.signUpEnabled ?? isSignUpEnabled(process.env.AUTHLANE_ALLOW_SIGNUP, environment);
  const modeConfiguration = authModeConfiguration(authMode, signUpEnabled);
  validateMagicLinkEmailConfiguration({
    authMode,
    environment,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
  });
  const trustedOrigins = validateTrustedOrigins(
    options?.trustedOrigins ||
      [
        'http://localhost:3000',
        'http://localhost:5173',
        ...(process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) || []),
      ].filter(Boolean),
    environment
  );

  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
    }),

    // Base URL for auth endpoints
    baseURL: options?.baseURL || process.env.BETTER_AUTH_URL || 'http://localhost:3000',

    secrets: parseAuthSecrets(process.env.BETTER_AUTH_SECRETS, environment),
    trustedOrigins,
    secondaryStorage: options?.secondaryStorage,

    // Email verification configuration
    emailVerification: emailEnabled
      ? {
          sendVerificationEmail: async ({ user, url }) => {
            requireEmailDelivery(
              await sendEmailVerification(user.email, {
                userName: user.name || undefined,
                verificationLink: url,
                expiresIn: '24 hours',
              })
            );
          },
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
        }
      : undefined,

    // Email + password authentication
    emailAndPassword: {
      enabled: modeConfiguration.emailAndPasswordEnabled,
      disableSignUp: !signUpEnabled,
      requireEmailVerification: emailEnabled, // Enable when email provider is configured
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashUserPassword,
        verify: async ({ hash, password }) => verifyUserPassword(password, hash),
      },
      // Password reset email
      sendResetPassword: emailEnabled
        ? async ({ user, url }) => {
            requireEmailDelivery(
              await sendPasswordReset(user.email, {
                userName: user.name || undefined,
                resetLink: url,
                expiresIn: '30 minutes',
              })
            );
          }
        : undefined,
    },

    // Session configuration
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      freshAge: 60 * 10,
      storeSessionInDatabase: shouldStoreAuthSessionsInDatabase(options?.secondaryStorage),
      cookieCache: { enabled: false },
    },

    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: 'database',
      skipStateCookieCheck: false,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      storage: options?.secondaryStorage ? 'secondary-storage' : 'memory',
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60 * 60, max: 5 },
        '/forget-password': { window: 60 * 60, max: 3 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        ...oidcProviderRateLimitRules,
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
              const inviteLink = buildInvitationLink(appUrl, data.id);
              requireEmailDelivery(
                await sendOrganizationInvitation(data.email, {
                  inviterName: data.inviter.user.name || data.inviter.user.email,
                  organizationName: data.organization.name,
                  inviteLink,
                  role: data.role,
                  expiresIn: '48 hours',
                })
              );
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
              await sendWelcomeEmail(data.acceptedUser.email, {
                userName: data.acceptedUser.name || 'there',
                organizationName: data.organization.name,
                dashboardLink: `${appUrl}/dashboard`,
                role: data.role,
              });
            }
          : undefined,
      }),

      ...(modeConfiguration.twoFactorEnabled
        ? [
            twoFactor({
              issuer: 'Authlane',
              skipVerificationOnEnable: false,
              allowPasswordless: false,
              twoFactorCookieMaxAge: 60 * 10,
              trustDeviceMaxAge: 60 * 60 * 24 * 7,
              accountLockout: {
                enabled: true,
                maxFailedAttempts: 5,
                durationSeconds: 60 * 15,
              },
            }),
          ]
        : []),
      ...(modeConfiguration.magicLink
        ? [
            magicLink({
              ...modeConfiguration.magicLink,
              sendMagicLink: async ({ email, url }) => {
                const result = options?.sendMagicLinkEmail
                  ? await options.sendMagicLinkEmail(email, url)
                  : await sendMagicLink(email, { magicLink: url, expiresIn: '10 minutes' });
                requireEmailDelivery(result);
              },
            }),
          ]
        : []),

      // Authlane's own OAuth 2.1 authorization-server surface, so a downstream SaaS can pair a
      // user identity against a workspace.
      createOidcProviderPlugin(db),

      // SSO plugin can be added here later:
      // sso({
      //   providers: ["oidc", "saml"]
      // })
    ],

    // Advanced options
    advanced: {
      useSecureCookies: environment === 'production',
      disableCSRFCheck: false,
      disableOriginCheck: false,
      cookiePrefix: 'authlane',
      defaultCookieAttributes: {
        httpOnly: true,
        secure: environment === 'production',
        sameSite: 'lax',
        path: '/',
      },
      ipAddress: {
        ipAddressHeaders: ['x-authlane-client-ip'],
        disableIpTracking: false,
      },
    },
  });
  return auth as unknown as Auth;
}

const DEVELOPMENT_AUTH_SECRET = `1:${'development-only-authlane-secret'.padEnd(32, '-')}`;

export type AuthMode = 'magic-link' | 'email-password';

export interface AuthModeConfiguration {
  emailAndPasswordEnabled: boolean;
  twoFactorEnabled: boolean;
  magicLink: null | {
    disableSignUp: boolean;
    expiresIn: number;
    storeToken: 'hashed';
  };
}

export function authModeConfiguration(
  authMode: AuthMode,
  signUpEnabled: boolean
): AuthModeConfiguration {
  if (authMode === 'magic-link') {
    return {
      emailAndPasswordEnabled: false,
      twoFactorEnabled: false,
      magicLink: {
        disableSignUp: !signUpEnabled,
        expiresIn: 600,
        storeToken: 'hashed',
      },
    };
  }
  return {
    emailAndPasswordEnabled: true,
    twoFactorEnabled: true,
    magicLink: null,
  };
}

export function parseAuthMode(value: string | undefined): AuthMode {
  const normalized = value?.trim().toLowerCase() || 'email-password';
  if (normalized === 'magic-link' || normalized === 'email-password') return normalized;
  throw new Error('AUTHLANE_AUTH_MODE must be magic-link or email-password');
}

export function validateMagicLinkEmailConfiguration(options: {
  authMode: AuthMode;
  environment: string;
  resendApiKey?: string;
  emailFrom?: string;
}): void {
  if (options.authMode !== 'magic-link' || options.environment !== 'production') return;
  if (!options.resendApiKey?.trim()) {
    throw new Error('RESEND_API_KEY is required for production magic-link authentication');
  }
  if (!options.emailFrom?.trim()) {
    throw new Error('EMAIL_FROM is required for production magic-link authentication');
  }
}

export function isSignUpEnabled(value: string | undefined, environment: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return environment !== 'production';
  }
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('AUTHLANE_ALLOW_SIGNUP must be true or false');
}

export function parseAuthSecrets(
  value: string | undefined,
  environment: string
): Array<{ version: number; value: string }> {
  if (!value?.trim()) {
    if (environment === 'production') {
      throw new Error('BETTER_AUTH_SECRETS is required in production');
    }
    value = DEVELOPMENT_AUTH_SECRET;
  }

  const versions = new Set<string>();
  const secrets = value.split(',').map((entry) => entry.trim());
  for (const entry of secrets) {
    const separator = entry.indexOf(':');
    const version = entry.slice(0, separator);
    const secret = entry.slice(separator + 1);
    if (!/^\d+$/.test(version) || secret.length < 32) {
      throw new Error(
        'BETTER_AUTH_SECRETS entries must use numeric-version:secret with at least 32 characters'
      );
    }
    if (versions.has(version)) {
      throw new Error('BETTER_AUTH_SECRETS contains a duplicate key version');
    }
    versions.add(version);
  }
  return secrets.map((entry) => {
    const separator = entry.indexOf(':');
    return { version: Number(entry.slice(0, separator)), value: entry.slice(separator + 1) };
  });
}

export function validateTrustedOrigins(origins: string[], environment: string): string[] {
  const validated = new Set<string>();
  for (const rawOrigin of origins) {
    const origin = rawOrigin.trim();
    if (!origin || origin === '*' || origin.includes('*')) {
      throw new Error('Authentication trusted origins must be exact origins without wildcards');
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid authentication trusted origin: ${origin}`);
    }
    if (parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error(`Authentication trusted origin must contain only an origin: ${origin}`);
    }
    if (environment === 'production' && parsed.protocol !== 'https:') {
      throw new Error(`Authentication trusted origins must use HTTPS in production: ${origin}`);
    }
    validated.add(origin);
  }
  if (validated.size === 0) {
    throw new Error('At least one authentication trusted origin is required');
  }
  return [...validated];
}

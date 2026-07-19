export function organizationSlug(name: string, suffix: string): string {
  const base =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'workspace';
  return `${base}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export function safeDashboardReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith('/dashboard')) return '/dashboard';
  if (value.startsWith('//')) return '/dashboard';
  try {
    const parsed = new URL(value, 'https://app.authlane.io');
    if (parsed.origin !== 'https://app.authlane.io' || !parsed.pathname.startsWith('/dashboard')) {
      return '/dashboard';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/dashboard';
  }
}

export function magicLinkErrorMessage(error: string | null): string {
  if (!error) return '';
  if (error === 'new_user_signup_disabled') {
    return 'Sign-up is currently closed. Use the email address of an existing account.';
  }
  return 'This sign-in link is invalid, expired, or already used. Request a new link.';
}

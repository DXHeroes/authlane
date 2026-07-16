const HIGH_CARDINALITY_SEGMENTS = new Set([
  'api-keys',
  'connections',
  'connect-sessions',
  'invitations',
  'members',
  'organizations',
  'services',
  'users',
]);

export function sanitizeMetricRoute(path: string): string {
  const segments = path.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    if (previous && HIGH_CARDINALITY_SEGMENTS.has(previous) && segments[index]) {
      segments[index] = ':id';
    }
  }
  return segments.join('/');
}

export function exactFrameOrigin(value: string | undefined, environment: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocalDevelopment =
      environment !== 'production' &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !isLocalDevelopment)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

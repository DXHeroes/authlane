/** Public origin of the dashboard, used to build links that land in a user's browser. */
export function getAppUrl(): string {
  return (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

/**
 * Link an invited member follows to accept. Dashboard routes are nested under `/dashboard`
 * (`apps/dashboard/src/App.tsx`), so the prefix is part of the contract, not decoration.
 */
export function buildInvitationLink(appUrl: string, invitationId: string): string {
  return `${appUrl}/dashboard/accept-invitation/${encodeURIComponent(invitationId)}`;
}

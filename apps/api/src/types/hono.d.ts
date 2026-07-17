/**
 * Hono context type extensions
 */

import type { User, Organization } from '@authlane/database';
import type { ApiPrincipal } from '../lib/api-principal.js';
import type { PublicSurface } from '../lib/public-surface.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: User | null;
    session: { id: string; userId: string; createdAt: Date | string } | null;
    organization: Organization | null;
    apiKey: string | null;
    principal: ApiPrincipal;
    clientIp: string;
    publicSurface: PublicSurface;
  }
}

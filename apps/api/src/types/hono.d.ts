/**
 * Hono context type extensions
 */

import type { User, Organization } from '@authlane/database';
import type { ApiPrincipal } from '../lib/api-principal.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: User | null;
    session: { id: string; userId: string } | null;
    organization: Organization | null;
    apiKey: string | null;
    principal: ApiPrincipal;
  }
}

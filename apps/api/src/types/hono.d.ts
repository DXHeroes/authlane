/**
 * Hono context type extensions
 */

import type { User, Organization } from '@authlane/database';

declare module 'hono' {
  interface ContextVariableMap {
    user: User | null;
    session: { id: string; userId: string } | null;
    organization: Organization | null;
    apiKey: string | null;
  }
}

import { ApiResource } from '../resource.js';
import type { CredentialLease, Result, UserServiceOptions } from '../types.js';

export class CredentialLeasesResource extends ApiResource {
  create({ externalUserId, serviceId }: UserServiceOptions): Promise<Result<CredentialLease>> {
    return this.request(
      `/api/v1/users/${encodeURIComponent(externalUserId)}/connections/${encodeURIComponent(serviceId)}/credential-leases`,
      { method: 'POST' }
    );
  }
}

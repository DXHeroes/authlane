import { ApiResource } from '../resource.js';
import type {
  Connection,
  Credentials,
  ExternalUserOptions,
  Result,
  UserServiceOptions,
} from '../types.js';

export class ConnectionsResource extends ApiResource {
  list({ externalUserId }: ExternalUserOptions): Promise<Result<Connection[]>> {
    return this.request(`/api/v1/users/${encodeURIComponent(externalUserId)}/connections`);
  }

  async get({ externalUserId, serviceId }: UserServiceOptions): Promise<Result<Connection>> {
    const result = await this.list({ externalUserId });
    if (result.error) return result;
    const connection = result.data.find((item) => item.serviceId === serviceId);
    return connection
      ? { data: connection, error: null }
      : { data: null, error: { message: 'Connection not found', code: 'NOT_FOUND' } };
  }

  getCredentials({ externalUserId, serviceId }: UserServiceOptions): Promise<Result<Credentials>> {
    return this.request(
      `/api/v1/users/${encodeURIComponent(externalUserId)}/connections/${encodeURIComponent(serviceId)}/credentials`
    );
  }
}

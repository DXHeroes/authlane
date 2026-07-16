import { ApiResource } from '../resource.js';
import type { ConnectSessionResponse, CreateConnectSessionOptions, Result } from '../types.js';

export class ConnectSessionsResource extends ApiResource {
  create(options: CreateConnectSessionOptions): Promise<Result<ConnectSessionResponse>> {
    return this.request('/api/v1/connect-sessions', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }
}

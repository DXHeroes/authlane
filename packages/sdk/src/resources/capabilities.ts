import { ApiResource } from '../resource.js';
import type { CapabilitiesResponse, Result, ToolOptions } from '../types.js';

export class CapabilitiesResource extends ApiResource {
  get({ externalUserId, format = 'mcp' }: ToolOptions): Promise<Result<CapabilitiesResponse>> {
    return this.request(
      `/api/v1/users/${encodeURIComponent(externalUserId)}/capabilities?format=${format}`
    );
  }
}

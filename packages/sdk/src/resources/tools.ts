import { ApiResource } from '../resource.js';
import type { Result, ToolOptions, ToolsResponse } from '../types.js';

export class ToolsResource extends ApiResource {
  list({ externalUserId, format = 'mcp' }: ToolOptions): Promise<Result<ToolsResponse>> {
    return this.request(
      `/api/v1/users/${encodeURIComponent(externalUserId)}/tools?format=${format}`
    );
  }
}

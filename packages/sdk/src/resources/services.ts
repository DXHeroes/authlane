import { ApiResource } from '../resource.js';
import type { Result, Service } from '../types.js';

export class ServicesResource extends ApiResource {
  list(): Promise<Result<Service[]>> {
    return this.request('/api/v1/catalog/services');
  }
}

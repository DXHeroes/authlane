import { createIntegrationAdapter } from '@authlane/shared';
import { tools } from './tools.js';

export { tools } from './tools.js';
export const adapter = createIntegrationAdapter('stripe', tools);
export default adapter;

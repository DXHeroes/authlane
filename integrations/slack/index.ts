import { createIntegrationAdapter } from '@authlane/shared';
import { tools } from './tools.js';

export { tools } from './tools.js';
export const adapter = createIntegrationAdapter('slack', tools);
export default adapter;

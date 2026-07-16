import { createIntegrationAdapter } from '@authlane/shared';
import { tools } from './tools.js';

export { tools } from './tools.js';
export const adapter = createIntegrationAdapter('google-drive', tools);
export default adapter;

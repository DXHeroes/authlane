import { createIntegrationAdapter } from '@authlane/shared';
import { tools } from './tools.js';

export { tools } from './tools.js';
export const adapter = createIntegrationAdapter('airtable', tools);
export default adapter;

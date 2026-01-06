/**
 * @authlane/react
 * React components and hooks for Authlane
 *
 * @example
 * ```tsx
 * import { AuthlaneProvider, ConnectionButton, ConnectionList } from '@authlane/react';
 *
 * function App() {
 *   return (
 *     <AuthlaneProvider publicKey="pk_..." userId="user_123">
 *       <ConnectionButton service="github" />
 *       <ConnectionList />
 *     </AuthlaneProvider>
 *   );
 * }
 * ```
 */

// Components
export { ConnectionButton, ConnectionList } from './components/index.js';
// Context and Provider
export { AuthlaneProvider, useAuthlaneContext } from './context.js';

// Hooks
export { useAuthlane, useConnection, useConnections } from './hooks/index.js';

// Types
export type {
  AuthlaneConfig,
  ConnectionButtonProps,
  ConnectionItemState,
  ConnectionListProps,
  ConnectionStatus,
  OAuthCallbackData,
  OAuthMode,
  OAuthWindowOptions,
} from './types.js';

// Utilities
export {
  generateAuthorizeUrl,
  openOAuthPopup,
  parseOAuthCallback,
  sendOAuthCallbackToParent,
  startOAuthPopupFlow,
  startOAuthRedirectFlow,
} from './utils/index.js';

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

// Context and Provider
export { AuthlaneProvider, useAuthlaneContext } from './context.js';

// Components
export { ConnectionButton, ConnectionList } from './components/index.js';

// Hooks
export { useAuthlane, useConnection, useConnections } from './hooks/index.js';

// Types
export type {
  AuthlaneConfig,
  ConnectionStatus,
  OAuthMode,
  ConnectionButtonProps,
  ConnectionListProps,
  ConnectionItemState,
  OAuthWindowOptions,
  OAuthCallbackData,
} from './types.js';

// Utilities
export {
  generateAuthorizeUrl,
  openOAuthPopup,
  startOAuthPopupFlow,
  startOAuthRedirectFlow,
  parseOAuthCallback,
  sendOAuthCallbackToParent,
} from './utils/index.js';

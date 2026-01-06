/**
 * ConnectionButton component
 * Handles OAuth flow for connecting services
 */

import { useCallback, useState } from 'react';
import { useAuthlaneContext } from '../context.js';
import type { ConnectionButtonProps } from '../types.js';
import { startOAuthPopupFlow, startOAuthRedirectFlow } from '../utils/oauth.js';

/**
 * Button component for initiating OAuth connection flow
 *
 * @example
 * ```tsx
 * import { ConnectionButton } from '@authlane/react';
 *
 * function App() {
 *   return (
 *     <ConnectionButton
 *       service="github"
 *       onSuccess={(connection) => {
 *         console.log('Connected!', connection);
 *       }}
 *       onError={(error) => {
 *         console.error('Failed to connect:', error);
 *       }}
 *     >
 *       Connect GitHub
 *     </ConnectionButton>
 *   );
 * }
 * ```
 */
export function ConnectionButton({
  service,
  mode = 'popup',
  onSuccess,
  onError,
  className = '',
  children,
  redirectUrl,
  scopes,
  disabled = false,
}: ConnectionButtonProps) {
  const { baseUrl, userId, client } = useAuthlaneContext();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);

    try {
      if (mode === 'popup') {
        // Start OAuth popup flow
        const callbackData = await startOAuthPopupFlow({
          baseUrl,
          userId,
          serviceId: service,
          scopes,
        });

        if (!callbackData.success) {
          throw new Error(callbackData.error || 'OAuth flow failed');
        }

        // Fetch the connection details
        const { data: connection, error } = await client.connections.get({
          userId,
          serviceId: service,
        });

        if (error) {
          throw new Error(error.message);
        }

        if (connection) {
          onSuccess?.(connection);
        }
      } else {
        // Start OAuth redirect flow
        if (!redirectUrl) {
          throw new Error('redirectUrl is required for redirect mode');
        }

        startOAuthRedirectFlow({
          baseUrl,
          userId,
          serviceId: service,
          redirectUrl,
          scopes,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      onError?.(err);
    } finally {
      setIsConnecting(false);
    }
  }, [baseUrl, userId, service, mode, scopes, redirectUrl, client, onSuccess, onError]);

  const buttonClass = [
    'authlane-connection-button',
    isConnecting ? 'authlane-connection-button--loading' : '',
    disabled ? 'authlane-connection-button--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={buttonClass}
      onClick={handleConnect}
      disabled={disabled || isConnecting}
    >
      {isConnecting ? 'Connecting...' : children || `Connect ${service}`}
    </button>
  );
}

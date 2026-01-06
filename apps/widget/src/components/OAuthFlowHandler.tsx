import { AlertTriangle, Loader2, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface OAuthFlowHandlerProps {
  serviceId: string;
  serviceName: string;
  authUrl: string;
  onSuccess: (connectionId: string) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export const OAuthFlowHandler: React.FC<OAuthFlowHandlerProps> = ({
  serviceId,
  serviceName,
  authUrl,
  onSuccess,
  onError,
  onClose,
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [popup, setPopup] = useState<Window | null>(null);

  const handleOAuthCallback = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'oauth:success') {
        setStatus('idle');
        onSuccess(event.data.connectionId);
        popup?.close();
      } else if (event.data?.type === 'oauth:error') {
        setStatus('error');
        setErrorMessage(event.data.error || 'Authentication failed');
        onError(new Error(event.data.error));
        popup?.close();
      }
    },
    [popup, onSuccess, onError]
  );

  useEffect(() => {
    window.addEventListener('message', handleOAuthCallback);
    return () => window.removeEventListener('message', handleOAuthCallback);
  }, [handleOAuthCallback]);

  useEffect(() => {
    if (popup) {
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          if (status === 'loading') {
            setStatus('error');
            setErrorMessage('Authentication window was closed');
          }
        }
      }, 500);

      return () => clearInterval(checkPopup);
    }
  }, [popup, status]);

  const startOAuthFlow = useCallback(() => {
    setStatus('loading');
    setErrorMessage('');

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popupWindow = window.open(
      authUrl,
      `oauth_${serviceId}`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
    );

    if (!popupWindow) {
      setStatus('error');
      setErrorMessage('Popup blocked. Please allow popups for this site.');
      onError(new Error('Popup blocked'));
      return;
    }

    setPopup(popupWindow);
  }, [authUrl, serviceId, onError]);

  const handleRetry = () => {
    setStatus('idle');
    setErrorMessage('');
    startOAuthFlow();
  };

  useEffect(() => {
    startOAuthFlow();
  }, [startOAuthFlow]);

  return (
    <div className="oauth-flow">
      <div className="oauth-flow__overlay" onClick={onClose} />
      <div className="oauth-flow__modal">
        <button className="oauth-flow__close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="oauth-flow__content">
          <h3 className="oauth-flow__title">Connect {serviceName}</h3>

          {status === 'loading' && (
            <div className="oauth-flow__loading">
              <Loader2 className="oauth-flow__spinner" size={32} />
              <p>Waiting for authentication...</p>
              <p className="oauth-flow__hint">Complete the authentication in the popup window</p>
            </div>
          )}

          {status === 'error' && (
            <div className="oauth-flow__error">
              <AlertTriangle size={32} className="oauth-flow__error-icon" />
              <p className="oauth-flow__error-message">{errorMessage}</p>
              <button className="oauth-flow__retry" onClick={handleRetry}>
                Try Again
              </button>
            </div>
          )}

          {status === 'idle' && !errorMessage && (
            <div className="oauth-flow__starting">
              <Loader2 className="oauth-flow__spinner" size={32} />
              <p>Opening authentication window...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

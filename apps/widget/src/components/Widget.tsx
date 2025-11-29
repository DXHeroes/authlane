import React, { useState, useEffect } from 'react';
import { ServiceSelector } from './ServiceSelector';
import { OAuthFlowHandler } from './OAuthFlowHandler';
import { useWidget } from '../hooks/useWidget';
import type { Service, WidgetConfig } from '../types';
import { postMessageBridge } from '../utils/postMessage';

interface WidgetProps {
  config?: WidgetConfig;
}

export const Widget: React.FC<WidgetProps> = ({ config: initialConfig }) => {
  const {
    config,
    services,
    loading,
    error,
    initiateOAuth,
    handleConnect,
    handleOAuthSuccess
  } = useWidget(initialConfig);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string>('');

  useEffect(() => {
    const updateHeight = () => {
      const height = document.body.scrollHeight;
      postMessageBridge.sendToParent({
        type: 'widget:resize',
        height
      });
    };

    const observer = new ResizeObserver(updateHeight);
    observer.observe(document.body);
    updateHeight();

    return () => observer.disconnect();
  }, []);

  const handleServiceSelect = (service: Service) => {
    const authUrl = initiateOAuth(service.id);
    setOauthUrl(authUrl);
    setSelectedService(service);
    handleConnect(service.id);
  };

  const handleOAuthClose = () => {
    setSelectedService(null);
    setOauthUrl('');
  };

  const handleOAuthSuccessWrapper = (connectionId: string) => {
    if (selectedService) {
      handleOAuthSuccess(connectionId, selectedService.id);
    }
    handleOAuthClose();
  };

  const handleOAuthError = (err: Error) => {
    console.error('OAuth error:', err);
    config?.onError?.(err);
  };

  if (!config) {
    return (
      <div className="widget widget--loading">
        <div className="widget__loading-message">
          Initializing widget...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="widget widget--error">
        <div className="widget__error-message">
          <p>Failed to load services</p>
          <small>{error.message}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="widget">
      <ServiceSelector
        services={services}
        onServiceSelect={handleServiceSelect}
        loading={loading}
      />

      {selectedService && oauthUrl && (
        <OAuthFlowHandler
          serviceId={selectedService.id}
          serviceName={selectedService.name}
          authUrl={oauthUrl}
          onSuccess={handleOAuthSuccessWrapper}
          onError={handleOAuthError}
          onClose={handleOAuthClose}
        />
      )}
    </div>
  );
};

import type React from 'react';
import { useEffect } from 'react';
import { useWidget } from '../hooks/useWidget';
import type { Service, WidgetConfig } from '../types';
import { postMessageBridge } from '../utils/postMessage';
import { ServiceSelector } from './ServiceSelector';

interface WidgetProps {
  config?: WidgetConfig;
}

export const Widget: React.FC<WidgetProps> = ({ config: initialConfig }) => {
  const { config, services, loading, error, handleConnect, handleDisconnect } =
    useWidget(initialConfig);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      postMessageBridge.sendToParent({ type: 'widget:resize', height: document.body.scrollHeight });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const handleServiceSelect = async (service: Service) => {
    try {
      if (service.status === 'connected') await handleDisconnect(service.id);
      else await handleConnect(service.id);
    } catch (cause) {
      config?.onError?.(cause instanceof Error ? cause : new Error('Connection action failed'));
    }
  };

  if (!config)
    return <div className="widget widget--error">Invalid or missing connect session.</div>;
  if (error) return <div className="widget widget--error">{error.message}</div>;
  return (
    <div className="widget">
      <ServiceSelector
        services={services}
        onServiceSelect={handleServiceSelect}
        loading={loading}
      />
    </div>
  );
};

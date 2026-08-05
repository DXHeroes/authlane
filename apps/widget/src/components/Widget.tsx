import { AlertTriangle } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useWidget } from '../hooks/useWidget';
import type { Service, WidgetConfig } from '../types';
import { postMessageBridge } from '../utils/postMessage';
import { ServiceSelector } from './ServiceSelector';

interface WidgetProps {
  config?: WidgetConfig;
}

/**
 * A failure needs a title, a plain reading of what happened, and a way forward. The
 * widget used to render the raw exception message in a bare div and stop there.
 */
function Notice({
  title,
  body,
  detail,
  action,
}: {
  title: string;
  body: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="widget">
      <div className="widget-notice" role="alert">
        <span className="widget-notice__icon widget-notice__icon--error">
          <AlertTriangle size={20} aria-hidden="true" />
        </span>
        <h2 className="widget-notice__title">{title}</h2>
        <p className="widget-notice__body">{body}</p>
        {detail && <p className="widget-notice__detail">{detail}</p>}
        {action && (
          <button type="button" className="widget-notice__action" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export const Widget: React.FC<WidgetProps> = ({ config: initialConfig }) => {
  const { config, services, loading, error, handleConnect, handleDisconnect } =
    useWidget(initialConfig);
  // Which card is mid-flight, so a second tap cannot start the same flow twice.
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      postMessageBridge.sendToParent({ type: 'widget:resize', height: document.body.scrollHeight });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const handleServiceSelect = async (service: Service) => {
    if (pendingServiceId) return;
    setPendingServiceId(service.id);
    try {
      if (service.status === 'connected') await handleDisconnect(service.id);
      else await handleConnect(service.id);
    } catch (cause) {
      config?.onError?.(cause instanceof Error ? cause : new Error('Connection action failed'));
    } finally {
      setPendingServiceId(null);
    }
  };

  if (!config) {
    return (
      <Notice
        title="This connection link is not valid"
        body="The link may have expired or already been used. Go back to the app you came from and start the connection again."
      />
    );
  }

  if (error) {
    return (
      <Notice
        title="Could not load your services"
        body="The connection service did not answer. This is usually temporary."
        detail={error.message}
        action={{ label: 'Try again', onClick: () => window.location.reload() }}
      />
    );
  }

  return (
    <div className="widget">
      <ServiceSelector
        services={services}
        onServiceSelect={handleServiceSelect}
        loading={loading}
        pendingServiceId={pendingServiceId}
      />
    </div>
  );
};

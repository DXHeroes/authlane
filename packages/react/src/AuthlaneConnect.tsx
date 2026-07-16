import { useEffect, useMemo, useRef, useState } from 'react';

export type AuthlaneConnectEvent =
  | { type: 'connected'; serviceId: string }
  | { type: 'disconnected'; serviceId: string }
  | { type: 'error'; error: string };

export interface AuthlaneConnectProps {
  /** Short-lived URL returned by the server-side connectSessions.create call. */
  connectUrl: string;
  title?: string;
  className?: string;
  minHeight?: number;
  onEvent?: (event: AuthlaneConnectEvent) => void;
}

export function AuthlaneConnect({
  connectUrl,
  title = 'Connect services',
  className,
  minHeight = 400,
  onEvent,
}: AuthlaneConnectProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  const authlaneOrigin = useMemo(() => new URL(connectUrl).origin, [connectUrl]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== authlaneOrigin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === 'widget:resize' && Number.isFinite(event.data.height)) {
        setHeight(Math.max(minHeight, Number(event.data.height)));
      } else if (event.data?.type === 'widget:connected') {
        onEvent?.({ type: 'connected', serviceId: String(event.data.serviceId) });
      } else if (event.data?.type === 'widget:disconnected') {
        onEvent?.({ type: 'disconnected', serviceId: String(event.data.serviceId) });
      } else if (event.data?.type === 'widget:error') {
        onEvent?.({ type: 'error', error: String(event.data.error) });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authlaneOrigin, minHeight, onEvent]);

  return (
    <iframe
      ref={iframe}
      src={connectUrl}
      title={title}
      className={className}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
      referrerPolicy="no-referrer"
      style={{ width: '100%', minHeight, height, border: 0 }}
    />
  );
}

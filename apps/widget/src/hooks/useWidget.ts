import { useCallback, useEffect, useRef, useState } from 'react';
import type { Service, WidgetConfig } from '../types';
import { postMessageBridge } from '../utils/postMessage';

function configFromLocation(): WidgetConfig | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const connectToken = fragment.get('session');
  const parentOrigin = new URLSearchParams(window.location.search).get('origin');
  if (!connectToken || !parentOrigin) return null;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return {
    connectToken,
    parentOrigin,
    apiUrl: `${window.location.origin}/api/v1`,
  };
}

export const useWidget = (initialConfig?: WidgetConfig) => {
  const [config] = useState<WidgetConfig | null>(initialConfig ?? configFromLocation());
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const oauthPopup = useRef<Window | null>(null);

  const applyTheme = useCallback((theme: WidgetConfig['theme']) => {
    if (!theme) return;
    const root = document.documentElement;
    if (theme.primaryColor) root.style.setProperty('--primary-color', theme.primaryColor);
    if (theme.backgroundColor) root.style.setProperty('--background-color', theme.backgroundColor);
    if (theme.textColor) root.style.setProperty('--text-color', theme.textColor);
    if (theme.borderRadius) root.style.setProperty('--border-radius', theme.borderRadius);
    if (theme.fontFamily) root.style.setProperty('--font-family', theme.fontFamily);
  }, []);

  const fetchSession = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const apiUrl = config.apiUrl ?? `${window.location.origin}/api/v1`;
      const response = await fetch(`${apiUrl}/connect/session`, {
        method: 'POST',
        headers: {
          Authorization: `ConnectSession ${config.connectToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parentOrigin: config.parentOrigin }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message ?? 'Failed to load connect session');
      }
      setServices(
        result.data.services.map((service: Partial<Service> & Pick<Service, 'id' | 'name'>) => ({
          authType: 'oauth2',
          // Everything a card renders now arrives from the API. This used to invent `icon: ''`,
          // `category: 'other'`, and "Connect X" — which is why the icon branch below never once
          // rendered and the category filter always came back empty.
          status: 'disconnected',
          ...service,
        }))
      );
      setError(null);
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error('Failed to load connect session');
      setError(nextError);
      postMessageBridge.sendToParent({ type: 'widget:error', error: nextError.message });
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (!config) return;
    postMessageBridge.setTargetOrigin(config.parentOrigin);
    applyTheme(config.theme);
    postMessageBridge.sendToParent({ type: 'widget:ready' });
    void fetchSession();
  }, [applyTheme, config, fetchSession]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== oauthPopup.current ||
        event.data?.type !== 'oauth:success'
      ) {
        return;
      }
      oauthPopup.current = null;
      const serviceId = String(event.data.serviceId);
      postMessageBridge.sendToParent({ type: 'widget:connected', serviceId });
      config?.onConnect?.(serviceId);
      void fetchSession();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [config, fetchSession]);

  const handleConnect = useCallback(
    async (serviceId: string) => {
      if (!config) return;
      const apiUrl = config.apiUrl ?? `${window.location.origin}/api/v1`;
      const response = await fetch(`${apiUrl}/connect/${encodeURIComponent(serviceId)}/authorize`, {
        method: 'POST',
        headers: {
          Authorization: `ConnectSession ${config.connectToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parentOrigin: config.parentOrigin,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message ?? 'Failed to start OAuth');
      }
      oauthPopup.current = window.open(
        result.data.authorizationUrl,
        `authlane_${serviceId}`,
        'width=600,height=720,noopener=false'
      );
    },
    [config]
  );

  const handleDisconnect = useCallback(
    async (serviceId: string) => {
      if (!config) return;
      const apiUrl = config.apiUrl ?? `${window.location.origin}/api/v1`;
      const response = await fetch(`${apiUrl}/connect/${encodeURIComponent(serviceId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `ConnectSession ${config.connectToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parentOrigin: config.parentOrigin,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message ?? 'Failed to disconnect');
      }
      postMessageBridge.sendToParent({ type: 'widget:disconnected', serviceId });
      config.onDisconnect?.(serviceId);
      await fetchSession();
    },
    [config, fetchSession]
  );

  return { config, services, loading, error, handleConnect, handleDisconnect };
};

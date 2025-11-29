import { useState, useEffect, useCallback, useRef } from 'react';
import type { WidgetConfig, Service, Connection } from '../types';
import { postMessageBridge } from '../utils/postMessage';

/**
 * Development mode default config
 * Used when widget is accessed directly (not in iframe) for testing
 */
const DEV_CONFIG: WidgetConfig = {
  apiUrl: 'http://localhost:3000/api/v1',
  apiKey: 'test_api_key_dev', // Replace with actual key from seed
  userId: 'test_user_dev',
};

/**
 * Check if we're running in standalone mode (not in iframe)
 */
const isStandaloneMode = () => {
  try {
    return window.self === window.top;
  } catch {
    return false; // Cross-origin iframe
  }
};

export const useWidget = (initialConfig?: WidgetConfig) => {
  const [config, setConfig] = useState<WidgetConfig | null>(initialConfig || null);
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const configReceivedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = postMessageBridge.onMessage((message) => {
      if (message.type === 'parent:config') {
        configReceivedRef.current = true;
        setConfig(message.config);
      } else if (message.type === 'parent:theme') {
        applyTheme(message.theme);
      }
    });

    postMessageBridge.sendToParent({ type: 'widget:ready' });

    // In standalone/dev mode, use default config after timeout if no parent config received
    if (isStandaloneMode() && !initialConfig) {
      const timeoutId = setTimeout(() => {
        if (!configReceivedRef.current) {
          console.log('[Widget] Running in development mode with default config');
          setConfig(DEV_CONFIG);
        }
      }, 1000); // 1 second timeout

      return () => {
        clearTimeout(timeoutId);
        unsubscribe();
      };
    }

    return unsubscribe;
  }, [initialConfig]);

  useEffect(() => {
    if (config) {
      fetchServices();
      fetchConnections();
    }
  }, [config]);

  const fetchServices = async () => {
    if (!config) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiUrl}/integrations`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch services');
      }

      const data = await response.json();
      const allServices = data.integrations || [];

      const filteredServices = config.services
        ? allServices.filter((s: Service) => config.services?.includes(s.id))
        : allServices;

      setServices(filteredServices);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      postMessageBridge.sendToParent({
        type: 'widget:error',
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchConnections = async () => {
    if (!config) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/connections?userId=${config.userId}`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }

      const data = await response.json();
      setConnections(data.connections || []);

      updateServicesWithConnectionStatus(data.connections || []);
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    }
  };

  const updateServicesWithConnectionStatus = (conns: Connection[]) => {
    setServices(prev => prev.map(service => {
      const connection = conns.find(c => c.serviceId === service.id);
      return {
        ...service,
        status: connection?.status || 'disconnected'
      };
    }));
  };

  const initiateOAuth = useCallback((serviceId: string) => {
    if (!config) return '';

    const authUrl = new URL(`${config.apiUrl}/oauth/${serviceId}/authorize`);
    authUrl.searchParams.set('userId', config.userId);
    authUrl.searchParams.set('redirect_uri', `${window.location.origin}/oauth-callback.html`);

    return authUrl.toString();
  }, [config]);

  const handleConnect = useCallback((serviceId: string) => {
    postMessageBridge.sendToParent({
      type: 'widget:connect',
      serviceId
    });

    config?.onConnect?.(serviceId);
  }, [config]);

  const handleDisconnect = useCallback(async (serviceId: string) => {
    if (!config) return;

    try {
      const connection = connections.find(c => c.serviceId === serviceId);
      if (!connection) return;

      const response = await fetch(
        `${config.apiUrl}/connections/${connection.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to disconnect service');
      }

      await fetchConnections();

      postMessageBridge.sendToParent({
        type: 'widget:disconnected',
        serviceId
      });

      config?.onDisconnect?.(serviceId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      config?.onError?.(error);
    }
  }, [config, connections]);

  const handleOAuthSuccess = useCallback((connectionId: string, serviceId: string) => {
    postMessageBridge.sendToParent({
      type: 'widget:connected',
      serviceId,
      connectionId
    });

    fetchConnections();
  }, []);

  const applyTheme = (theme: WidgetConfig['theme']) => {
    if (!theme) return;

    const root = document.documentElement;
    if (theme.primaryColor) root.style.setProperty('--primary-color', theme.primaryColor);
    if (theme.backgroundColor) root.style.setProperty('--background-color', theme.backgroundColor);
    if (theme.textColor) root.style.setProperty('--text-color', theme.textColor);
    if (theme.borderRadius) root.style.setProperty('--border-radius', theme.borderRadius);
    if (theme.fontFamily) root.style.setProperty('--font-family', theme.fontFamily);
  };

  return {
    config,
    services,
    connections,
    loading,
    error,
    initiateOAuth,
    handleConnect,
    handleDisconnect,
    handleOAuthSuccess
  };
};

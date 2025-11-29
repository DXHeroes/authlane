export interface Service {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  status?: 'connected' | 'disconnected' | 'expired';
}

export interface Connection {
  id: string;
  serviceId: string;
  userId: string;
  status: 'connected' | 'disconnected' | 'expired';
  expiresAt?: string;
  createdAt: string;
}

export interface WidgetConfig {
  apiUrl: string;
  apiKey: string;
  userId: string;
  theme?: WidgetTheme;
  services?: string[];
  onConnect?: (serviceId: string) => void;
  onDisconnect?: (serviceId: string) => void;
  onError?: (error: Error) => void;
}

export interface WidgetTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
  fontFamily?: string;
}

export type WidgetMessage =
  | { type: 'widget:ready' }
  | { type: 'widget:resize'; height: number }
  | { type: 'widget:connect'; serviceId: string }
  | { type: 'widget:disconnect'; serviceId: string }
  | { type: 'widget:error'; error: string }
  | { type: 'widget:connected'; serviceId: string; connectionId: string }
  | { type: 'widget:disconnected'; serviceId: string };

export type ParentMessage =
  | { type: 'parent:config'; config: WidgetConfig }
  | { type: 'parent:theme'; theme: WidgetTheme };

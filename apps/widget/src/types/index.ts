export type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'expired' | 'error';

export type ServiceCategory =
  | 'communication'
  | 'productivity'
  | 'crm'
  | 'engineering'
  | 'storage'
  | 'finance'
  | 'design'
  | 'infrastructure'
  | 'observability'
  | 'security';

export interface Service {
  id: string;
  name: string;
  authType: string;
  /** Null for a server the workspace registered itself, which declares no category. */
  category: ServiceCategory | null;
  /** Absolute URL, or null when Authlane ships no mark. Fall back to initials over brandColor. */
  iconUrl: string | null;
  description: string | null;
  brandColor: string | null;
  /** One or two characters. Always present, so a card can always draw something. */
  initials: string;
  status: ConnectionStatus;
}

export interface WidgetConfig {
  connectToken: string;
  parentOrigin: string;
  apiUrl?: string;
  theme?: WidgetTheme;
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
  | { type: 'widget:connected'; serviceId: string }
  | { type: 'widget:disconnected'; serviceId: string };

export type ParentMessage =
  | { type: 'parent:config'; config: WidgetConfig }
  | { type: 'parent:theme'; theme: WidgetTheme };

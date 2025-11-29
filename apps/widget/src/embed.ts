import type { WidgetConfig } from './types';

export interface AuthlaneWidgetInstance {
  open: () => void;
  close: () => void;
  destroy: () => void;
  updateConfig: (config: Partial<WidgetConfig>) => void;
}

export class AuthlaneWidget {
  private iframe: HTMLIFrameElement | null = null;
  private container: HTMLElement | null = null;
  private config: WidgetConfig;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(config: WidgetConfig) {
    this.config = {
      ...config,
      theme: {
        primaryColor: '#3b82f6',
        backgroundColor: '#ffffff',
        textColor: '#1f2937',
        borderRadius: '8px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...config.theme
      }
    };
  }

  public mount(containerId: string): AuthlaneWidgetInstance {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.container = container;
    this.createIframe();
    this.setupMessageListener();

    return {
      open: () => this.show(),
      close: () => this.hide(),
      destroy: () => this.destroy(),
      updateConfig: (config) => this.updateConfig(config)
    };
  }

  private createIframe(): void {
    if (!this.container) return;

    this.iframe = document.createElement('iframe');
    this.iframe.src = this.getIframeSrc();
    this.iframe.style.cssText = `
      width: 100%;
      border: none;
      min-height: 400px;
      background: ${this.config.theme?.backgroundColor || '#ffffff'};
      border-radius: ${this.config.theme?.borderRadius || '8px'};
    `;
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    this.iframe.setAttribute('allow', 'clipboard-write');

    this.container.appendChild(this.iframe);
  }

  private getIframeSrc(): string {
    const url = new URL('/widget', window.location.origin);
    return url.toString();
  }

  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      if (!this.iframe || event.source !== this.iframe.contentWindow) {
        return;
      }

      const { type } = event.data;

      switch (type) {
        case 'widget:ready':
          this.sendConfig();
          break;
        case 'widget:resize':
          this.handleResize(event.data.height);
          break;
        case 'widget:connect':
          this.config.onConnect?.(event.data.serviceId);
          break;
        case 'widget:disconnect':
          this.config.onDisconnect?.(event.data.serviceId);
          break;
        case 'widget:error':
          this.config.onError?.(new Error(event.data.error));
          break;
        case 'widget:connected':
          this.config.onConnect?.(event.data.serviceId);
          break;
        case 'widget:disconnected':
          this.config.onDisconnect?.(event.data.serviceId);
          break;
      }
    };

    window.addEventListener('message', this.messageHandler);
  }

  private sendConfig(): void {
    if (!this.iframe?.contentWindow) return;

    this.iframe.contentWindow.postMessage(
      {
        type: 'parent:config',
        config: this.config
      },
      '*'
    );
  }

  private handleResize(height: number): void {
    if (!this.iframe) return;
    this.iframe.style.height = `${height}px`;
  }

  private show(): void {
    if (!this.container) return;
    this.container.style.display = 'block';
  }

  private hide(): void {
    if (!this.container) return;
    this.container.style.display = 'none';
  }

  private updateConfig(config: Partial<WidgetConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.theme && this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(
        {
          type: 'parent:theme',
          theme: this.config.theme
        },
        '*'
      );
    }

    this.sendConfig();
  }

  public destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    this.container = null;
  }
}

if (typeof window !== 'undefined') {
  (window as any).AuthlaneWidget = AuthlaneWidget;
}

export default AuthlaneWidget;

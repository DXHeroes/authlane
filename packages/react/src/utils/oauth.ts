/**
 * OAuth utilities for handling OAuth flow in browser
 */

import type { OAuthCallbackData, OAuthWindowOptions } from '../types.js';

/**
 * Default OAuth popup window options
 */
const DEFAULT_OAUTH_WINDOW_OPTIONS: Required<OAuthWindowOptions> = {
  width: 600,
  height: 700,
  top: 100,
  left: 100,
};

/**
 * Generate OAuth authorize URL
 */
export function generateAuthorizeUrl(params: {
  baseUrl: string;
  userId: string;
  serviceId: string;
  redirectUrl?: string;
  scopes?: string[];
}): string {
  const { baseUrl, userId, serviceId, redirectUrl, scopes } = params;

  const url = new URL(`${baseUrl}/api/v1/oauth/authorize`);
  url.searchParams.set('user_id', userId);
  url.searchParams.set('service_id', serviceId);

  if (redirectUrl) {
    url.searchParams.set('redirect_url', redirectUrl);
  }

  if (scopes && scopes.length > 0) {
    url.searchParams.set('scopes', scopes.join(','));
  }

  return url.toString();
}

/**
 * Open OAuth popup window
 */
export function openOAuthPopup(url: string, options: OAuthWindowOptions = {}): Window | null {
  const opts = { ...DEFAULT_OAUTH_WINDOW_OPTIONS, ...options };

  // Center popup on screen if top/left not specified
  if (!options.top || !options.left) {
    const screenLeft = window.screenLeft ?? window.screenX;
    const screenTop = window.screenTop ?? window.screenY;
    const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
    const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;

    opts.left = screenLeft + (width - opts.width) / 2;
    opts.top = screenTop + (height - opts.height) / 2;
  }

  const features = [
    `width=${opts.width}`,
    `height=${opts.height}`,
    `top=${opts.top}`,
    `left=${opts.left}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  return window.open(url, 'oauth_popup', features);
}

/**
 * Wait for OAuth callback in popup window
 */
export function waitForOAuthCallback(
  popup: Window,
  timeoutMs = 300000 // 5 minutes
): Promise<OAuthCallbackData> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('OAuth flow timed out'));
    }, timeoutMs);

    const handleMessage = (event: MessageEvent) => {
      // Verify origin if needed
      // if (event.origin !== expectedOrigin) return;

      if (event.data?.type === 'authlane_oauth_callback') {
        cleanup();
        resolve(event.data.payload as OAuthCallbackData);
      }
    };

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('OAuth popup was closed'));
      }
    }, 1000);

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(checkClosed);
      window.removeEventListener('message', handleMessage);
      if (!popup.closed) {
        popup.close();
      }
    };

    window.addEventListener('message', handleMessage);
  });
}

/**
 * Start OAuth flow with popup
 */
export async function startOAuthPopupFlow(params: {
  baseUrl: string;
  userId: string;
  serviceId: string;
  scopes?: string[];
  windowOptions?: OAuthWindowOptions;
}): Promise<OAuthCallbackData> {
  const { baseUrl, userId, serviceId, scopes, windowOptions } = params;

  // Generate authorize URL
  const authorizeUrl = generateAuthorizeUrl({
    baseUrl,
    userId,
    serviceId,
    scopes,
  });

  // Open popup
  const popup = openOAuthPopup(authorizeUrl, windowOptions);

  if (!popup) {
    throw new Error('Failed to open OAuth popup. Please check popup blocker settings.');
  }

  // Wait for callback
  return waitForOAuthCallback(popup);
}

/**
 * Start OAuth flow with redirect
 */
export function startOAuthRedirectFlow(params: {
  baseUrl: string;
  userId: string;
  serviceId: string;
  redirectUrl: string;
  scopes?: string[];
}): void {
  const { baseUrl, userId, serviceId, redirectUrl, scopes } = params;

  const authorizeUrl = generateAuthorizeUrl({
    baseUrl,
    userId,
    serviceId,
    redirectUrl,
    scopes,
  });

  window.location.href = authorizeUrl;
}

/**
 * Parse OAuth callback from URL
 */
export function parseOAuthCallback(): OAuthCallbackData | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);

  const userId = params.get('user_id');
  const serviceId = params.get('service_id');
  const success = params.get('success') === 'true';
  const error = params.get('error');

  if (!userId || !serviceId) {
    return null;
  }

  return {
    userId,
    serviceId,
    success,
    error: error || undefined,
  };
}

/**
 * Send OAuth callback to parent window (for popup mode)
 */
export function sendOAuthCallbackToParent(data: OAuthCallbackData): void {
  if (window.opener) {
    window.opener.postMessage(
      {
        type: 'authlane_oauth_callback',
        payload: data,
      },
      '*' // TODO: Use specific origin for security
    );
  }
}

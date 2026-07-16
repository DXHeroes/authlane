import { Authlane } from '@authlane/sdk';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createExampleApi } from './app.js';
import { createDemoProvider, isDemoProviderEnabled } from './demo-provider.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const apiKey = requiredEnvironment('AUTHLANE_API_KEY');
const browserOrigin = process.env.EXAMPLE_BROWSER_ORIGIN ?? 'http://localhost:5174';
const externalUserId = process.env.EXAMPLE_EXTERNAL_USER_ID ?? 'demo_user_123';
const port = Number.parseInt(process.env.EXAMPLE_SERVER_PORT ?? '5175', 10);
const authlane = new Authlane({
  apiKey,
  baseUrl: process.env.AUTHLANE_API_URL ?? 'http://localhost:3000',
});

const app = new Hono();
if (isDemoProviderEnabled()) {
  const signingSecret = Buffer.from(requiredEnvironment('DEMO_PROVIDER_SIGNING_SECRET'), 'hex');
  if (signingSecret.byteLength !== 32) {
    throw new Error('DEMO_PROVIDER_SIGNING_SECRET must be exactly 32 bytes of hexadecimal data');
  }
  app.route(
    '/',
    createDemoProvider({
      clientId: requiredEnvironment('DEMO_OAUTH_CLIENT_ID'),
      clientSecret: requiredEnvironment('DEMO_OAUTH_CLIENT_SECRET'),
      redirectUri: requiredEnvironment('DEMO_OAUTH_REDIRECT_URI'),
      providerOrigin: browserOrigin,
      signingSecret,
      accessTokenTtlSeconds: 305,
    })
  );
}
app.route(
  '/',
  createExampleApi({
    authlane,
    externalUserId,
    browserOrigin,
    demoProviderBaseUrl: `${browserOrigin}/demo-provider`,
  })
);
app.use('*', async (c, next) => {
  const authlaneOrigin = new URL(process.env.AUTHLANE_API_URL ?? 'http://localhost:3000').origin;
  c.header(
    'Content-Security-Policy',
    `default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src ${authlaneOrigin}; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`
  );
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  await next();
});
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, port });

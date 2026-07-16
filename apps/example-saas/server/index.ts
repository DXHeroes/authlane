import { Authlane } from '@authlane/sdk';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createExampleApi } from './app.js';

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
app.route('/', createExampleApi({ authlane, externalUserId, browserOrigin }));
app.use('*', async (c, next) => {
  c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'");
  c.header('Referrer-Policy', 'no-referrer');
  await next();
});
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, port });

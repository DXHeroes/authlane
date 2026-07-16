import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';

type DemoEnvironment = Record<string, string | undefined>;

interface DemoProviderOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  providerOrigin: string;
  signingSecret: Uint8Array;
  accessTokenTtlSeconds?: number;
  now?: () => number;
}

interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
  codeChallenge: string;
  consentDigest: string;
  expiresAt: number;
}

interface AuthorizationCode extends AuthorizationRequest {
  used: boolean;
}

interface TokenPayload {
  typ: 'access' | 'refresh';
  exp: number;
  generation: number;
  nonce: string;
}

const AUTHORIZATION_REQUEST_TTL_MS = 5 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60;
const TOKEN_RE = /^[A-Za-z0-9._~-]+$/;
const PKCE_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CONSENT_COOKIE = 'authlane_demo_consent';
const DEMO_PROVIDER_ORIGIN = 'http://localhost:5175';
const DEMO_CALLBACK_URI = 'http://localhost:3000/api/v1/oauth/authlane-demo/callback';

export function isDemoProviderEnabled(environment: DemoEnvironment = process.env): boolean {
  return environment.AUTHLANE_DEMO_MODE === 'true' && environment.NODE_ENV !== 'production';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function oauthError(error: string, description: string, status: 400 | 401 = 400) {
  return { status, body: { error, error_description: description } } as const;
}

function cookieValue(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const entry of header.split(';')) {
    const [cookieName, ...value] = entry.trim().split('=');
    if (cookieName === name) return value.join('=');
  }
  return '';
}

export function createDemoProvider(options: DemoProviderOptions) {
  if (options.signingSecret.byteLength < 32) {
    throw new Error('Demo provider signing secret must contain at least 32 bytes');
  }
  if (options.providerOrigin !== DEMO_PROVIDER_ORIGIN) {
    throw new Error(`Demo provider origin must be exactly ${DEMO_PROVIDER_ORIGIN}`);
  }
  if (options.redirectUri !== DEMO_CALLBACK_URI) {
    throw new Error(`Authlane demo callback must be exactly ${DEMO_CALLBACK_URI}`);
  }
  if (
    options.clientId.length < 8 ||
    options.clientId.length > 128 ||
    !TOKEN_RE.test(options.clientId)
  ) {
    throw new Error('Demo provider client ID must be an 8-128 character OAuth token');
  }
  if (
    options.clientSecret.length < 32 ||
    options.clientSecret.length > 256 ||
    !TOKEN_RE.test(options.clientSecret)
  ) {
    throw new Error('Demo provider client secret must be a 32-256 character OAuth token');
  }
  const accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 305;
  if (
    !Number.isInteger(accessTokenTtlSeconds) ||
    accessTokenTtlSeconds < 60 ||
    accessTokenTtlSeconds > 900
  ) {
    throw new Error('Demo provider access-token TTL must be an integer between 60 and 900 seconds');
  }
  const redirectUrl = new URL(options.redirectUri);
  const app = new Hono();
  const now = options.now ?? Date.now;
  const authorizationRequests = new Map<string, AuthorizationRequest>();
  const authorizationCodes = new Map<string, AuthorizationCode>();
  const usedRefreshTokens = new Set<string>();

  function signToken(payload: TokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', options.signingSecret)
      .update(encoded)
      .digest('base64url');
    return `authlane_demo.${encoded}.${signature}`;
  }

  function verifyToken(token: string, expectedType: TokenPayload['typ']): TokenPayload | null {
    const [prefix, encoded, signature, extra] = token.split('.');
    if (prefix !== 'authlane_demo' || !encoded || !signature || extra) return null;
    const expected = createHmac('sha256', options.signingSecret)
      .update(encoded)
      .digest('base64url');
    if (!constantTimeEquals(signature, expected)) return null;
    try {
      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8')
      ) as TokenPayload;
      if (
        payload.typ !== expectedType ||
        !Number.isInteger(payload.exp) ||
        payload.exp <= Math.floor(now() / 1000) ||
        !Number.isInteger(payload.generation) ||
        payload.generation < 1 ||
        typeof payload.nonce !== 'string'
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  function issueTokenPair(generation: number) {
    const nowSeconds = Math.floor(now() / 1000);
    return {
      access_token: signToken({
        typ: 'access',
        exp: nowSeconds + accessTokenTtlSeconds,
        generation,
        nonce: randomBytes(18).toString('base64url'),
      }),
      refresh_token: signToken({
        typ: 'refresh',
        exp: nowSeconds + REFRESH_TOKEN_TTL_SECONDS,
        generation,
        nonce: randomBytes(18).toString('base64url'),
      }),
      token_type: 'Bearer',
      expires_in: accessTokenTtlSeconds,
      scope: 'demo:read',
    };
  }

  app.use('/demo-provider/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; form-action ${options.providerOrigin} ${redirectUrl.origin}; frame-ancestors 'none'; base-uri 'none'`
    );
    await next();
  });

  app.get('/demo-provider/authorize', (c) => {
    const query = c.req.query();
    if (
      query.client_id !== options.clientId ||
      query.redirect_uri !== options.redirectUri ||
      query.response_type !== 'code' ||
      query.scope !== 'demo:read' ||
      query.code_challenge_method !== 'S256' ||
      !query.state ||
      query.state.length > 512 ||
      !TOKEN_RE.test(query.state) ||
      !query.code_challenge ||
      !PKCE_RE.test(query.code_challenge)
    ) {
      const error = oauthError('invalid_request', 'Invalid OAuth authorization request');
      return c.json(error.body, error.status);
    }

    const requestId = randomBytes(32).toString('base64url');
    const consentToken = randomBytes(32).toString('base64url');
    authorizationRequests.set(requestId, {
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
      state: query.state,
      scope: query.scope,
      codeChallenge: query.code_challenge,
      consentDigest: createHmac('sha256', options.signingSecret)
        .update(consentToken)
        .digest('base64url'),
      expiresAt: now() + AUTHORIZATION_REQUEST_TTL_MS,
    });
    c.header(
      'Set-Cookie',
      `${CONSENT_COOKIE}=${consentToken}; HttpOnly; Secure; SameSite=None; Path=/demo-provider/authorize; Max-Age=300`
    );
    const safeScope = escapeHtml(query.scope);
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Authlane Demo Provider</title><style>body{font:16px system-ui;max-width:38rem;margin:4rem auto;padding:0 1.5rem;color:#172033}button{padding:.7rem 1rem;margin-right:.5rem}code{background:#eef2f7;padding:.15rem .35rem}</style></head>
<body><main><h1>Connect Authlane Demo Provider</h1><p>This deterministic local provider will grant <code>${safeScope}</code>. It never contacts the internet.</p>
<form method="post" action="/demo-provider/authorize"><input type="hidden" name="request_id" value="${requestId}">
<button name="decision" value="approve" type="submit">Allow connection</button><button name="decision" value="deny" type="submit">Deny</button></form></main></body></html>`);
  });

  app.post('/demo-provider/authorize', async (c) => {
    if (!c.req.header('content-type')?.startsWith('application/x-www-form-urlencoded')) {
      return c.json({ error: 'invalid_request' }, 415);
    }
    const form = await c.req.parseBody();
    const requestId = typeof form.request_id === 'string' ? form.request_id : '';
    const request = authorizationRequests.get(requestId);
    const origin = c.req.header('origin');
    const consentToken = cookieValue(c.req.header('cookie'), CONSENT_COOKIE);
    const consentDigest = createHmac('sha256', options.signingSecret)
      .update(consentToken)
      .digest('base64url');
    if (
      !request ||
      (origin !== options.providerOrigin && origin !== 'null') ||
      !consentToken ||
      !constantTimeEquals(consentDigest, request.consentDigest)
    ) {
      return c.json({ error: 'access_denied' }, 403);
    }
    authorizationRequests.delete(requestId);
    c.header(
      'Set-Cookie',
      `${CONSENT_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/demo-provider/authorize; Max-Age=0`
    );
    if (request.expiresAt <= now()) {
      return c.json(oauthError('invalid_request', 'Authorization request expired').body, 400);
    }
    const callback = new URL(request.redirectUri);
    callback.searchParams.set('state', request.state);
    if (form.decision !== 'approve') {
      callback.searchParams.set('error', 'access_denied');
      return c.redirect(callback.toString(), 302);
    }
    const code = randomBytes(32).toString('base64url');
    authorizationCodes.set(code, {
      ...request,
      expiresAt: now() + AUTHORIZATION_CODE_TTL_MS,
      used: false,
    });
    callback.searchParams.set('code', code);
    return c.redirect(callback.toString(), 302);
  });

  app.post('/demo-provider/token', async (c) => {
    if (!c.req.header('content-type')?.startsWith('application/x-www-form-urlencoded')) {
      return c.json(oauthError('invalid_request', 'Form encoding is required').body, 400);
    }
    const form = await c.req.parseBody();
    const submittedClientId = typeof form.client_id === 'string' ? form.client_id : '';
    const submittedClientSecret = typeof form.client_secret === 'string' ? form.client_secret : '';
    if (
      !constantTimeEquals(submittedClientId, options.clientId) ||
      !constantTimeEquals(submittedClientSecret, options.clientSecret)
    ) {
      const error = oauthError('invalid_client', 'Client authentication failed', 401);
      return c.json(error.body, error.status);
    }

    if (form.grant_type === 'authorization_code') {
      const code = typeof form.code === 'string' ? form.code : '';
      const record = authorizationCodes.get(code);
      const verifier = typeof form.code_verifier === 'string' ? form.code_verifier : '';
      const actualChallenge = PKCE_RE.test(verifier)
        ? createHash('sha256').update(verifier).digest('base64url')
        : '';
      if (
        !record ||
        record.used ||
        record.expiresAt <= now() ||
        form.redirect_uri !== record.redirectUri ||
        !constantTimeEquals(actualChallenge, record.codeChallenge)
      ) {
        authorizationCodes.delete(code);
        return c.json(oauthError('invalid_grant', 'Authorization code is invalid').body, 400);
      }
      record.used = true;
      authorizationCodes.delete(code);
      return c.json(issueTokenPair(1));
    }

    if (form.grant_type === 'refresh_token') {
      const refreshToken = typeof form.refresh_token === 'string' ? form.refresh_token : '';
      const payload = verifyToken(refreshToken, 'refresh');
      const tokenFingerprint = createHmac('sha256', options.signingSecret)
        .update(refreshToken)
        .digest('base64url');
      if (!payload || usedRefreshTokens.has(tokenFingerprint)) {
        return c.json(oauthError('invalid_grant', 'Refresh token is invalid').body, 400);
      }
      usedRefreshTokens.add(tokenFingerprint);
      return c.json(issueTokenPair(payload.generation + 1));
    }

    return c.json(oauthError('unsupported_grant_type', 'Unsupported grant type').body, 400);
  });

  app.get('/demo-provider/resources', (c) => {
    const authorization = c.req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const payload = verifyToken(token, 'access');
    if (!payload) return c.json({ error: 'invalid_token' }, 401);
    return c.json({
      generation: payload.generation,
      resources: [
        { id: 'demo-project-1', name: 'Launch checklist', status: 'active' },
        { id: 'demo-project-2', name: 'Security review', status: 'ready' },
      ],
    });
  });

  return app;
}

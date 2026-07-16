import type { AuthlaneError, Connection, CredentialLease, Result, Service } from '@authlane/sdk';
import { Hono } from 'hono';

interface ConnectSession {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
}

interface ExampleAuthlaneClient {
  connections: {
    list(input: { externalUserId: string }): Promise<Result<Connection[]>>;
  };
  services: {
    list(): Promise<Result<Service[]>>;
  };
  connectSessions: {
    create(input: {
      externalUserId: string;
      allowedServices: string[];
      allowedOrigin: string;
    }): Promise<Result<ConnectSession>>;
  };
  credentialLeases: {
    create(input: { externalUserId: string; serviceId: string }): Promise<Result<CredentialLease>>;
  };
}

interface ExampleApiOptions {
  authlane: ExampleAuthlaneClient;
  externalUserId: string;
  browserOrigin: string;
  providerFetch?: typeof fetch;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  private: boolean;
}

function errorResponse(error: AuthlaneError) {
  return {
    data: null,
    error: {
      message: error.message,
      code: error.code,
    },
  };
}

function safeUpstreamStatus(
  statusCode: number | undefined
): 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 {
  switch (statusCode) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 409:
    case 429:
    case 500:
      return statusCode;
    default:
      return 502;
  }
}

function isGitHubRepository(value: unknown): value is GitHubRepository {
  if (!value || typeof value !== 'object') return false;
  const repository = value as Record<string, unknown>;
  return (
    typeof repository.id === 'number' &&
    typeof repository.name === 'string' &&
    typeof repository.full_name === 'string' &&
    (repository.description === null || typeof repository.description === 'string') &&
    typeof repository.html_url === 'string' &&
    repository.html_url.startsWith('https://github.com/') &&
    typeof repository.stargazers_count === 'number' &&
    (repository.language === null || typeof repository.language === 'string') &&
    typeof repository.private === 'boolean'
  );
}

function sanitizeGitHubRepository(repository: GitHubRepository): GitHubRepository {
  return {
    id: repository.id,
    name: repository.name,
    full_name: repository.full_name,
    description: repository.description,
    html_url: repository.html_url,
    stargazers_count: repository.stargazers_count,
    language: repository.language,
    private: repository.private,
  };
}

export function createExampleApi(options: ExampleApiOptions) {
  const app = new Hono();
  const providerFetch = options.providerFetch ?? fetch;

  app.use('/api/example/*', async (c, next) => {
    c.header('Cache-Control', 'no-store, private');
    c.header('Pragma', 'no-cache');
    c.header('X-Content-Type-Options', 'nosniff');
    if (c.req.method !== 'GET' && c.req.header('origin') !== options.browserOrigin) {
      return c.json(
        { data: null, error: { message: 'Cross-origin request rejected', code: 'CSRF_FAILED' } },
        403
      );
    }
    await next();
  });

  app.get('/api/example/services', async (c) => {
    const result = await options.authlane.services.list();
    return result.error
      ? c.json(errorResponse(result.error), safeUpstreamStatus(result.error.statusCode))
      : c.json(result);
  });

  app.get('/api/example/connections', async (c) => {
    const result = await options.authlane.connections.list({
      externalUserId: options.externalUserId,
    });
    return result.error
      ? c.json(errorResponse(result.error), safeUpstreamStatus(result.error.statusCode))
      : c.json(result);
  });

  app.post('/api/example/connect-sessions/:serviceId', async (c) => {
    const serviceId = c.req.param('serviceId');
    if (!/^[a-z0-9-]{1,100}$/.test(serviceId)) {
      return c.json(
        { data: null, error: { message: 'Invalid service ID', code: 'VALIDATION_ERROR' } },
        400
      );
    }
    const result = await options.authlane.connectSessions.create({
      externalUserId: options.externalUserId,
      allowedServices: [serviceId],
      allowedOrigin: options.browserOrigin,
    });
    if (result.error) {
      return c.json(errorResponse(result.error), safeUpstreamStatus(result.error.statusCode));
    }
    return c.json({ data: { connectUrl: result.data.url }, error: null }, 201);
  });

  app.post('/api/example/github/repositories', async (c) => {
    const leaseResult = await options.authlane.credentialLeases.create({
      externalUserId: options.externalUserId,
      serviceId: 'github',
    });
    if (leaseResult.error) {
      return c.json(
        errorResponse(leaseResult.error),
        safeUpstreamStatus(leaseResult.error.statusCode)
      );
    }
    if (leaseResult.data.type !== 'oauth2') {
      return c.json(
        {
          data: null,
          error: { message: 'GitHub requires an OAuth connection', code: 'INVALID_CREDENTIALS' },
        },
        409
      );
    }

    const providerResponse = await providerFetch(
      'https://api.github.com/user/repos?per_page=10&sort=updated',
      {
        headers: {
          Authorization: `${leaseResult.data.tokenType} ${leaseResult.data.accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!providerResponse.ok) {
      return c.json(
        {
          data: null,
          error: { message: 'GitHub request failed', code: 'PROVIDER_REQUEST_FAILED' },
        },
        502
      );
    }
    const payload: unknown = await providerResponse.json();
    if (!Array.isArray(payload)) {
      return c.json(
        {
          data: null,
          error: {
            message: 'GitHub returned an invalid response',
            code: 'PROVIDER_RESPONSE_INVALID',
          },
        },
        502
      );
    }
    const repositories = payload
      .filter(isGitHubRepository)
      .slice(0, 10)
      .map(sanitizeGitHubRepository);
    return c.json({ data: repositories, error: null });
  });

  return app;
}

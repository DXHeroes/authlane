import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stateDirectory = join(root, '.authlane-demo');
const runtimeFile = join(stateDirectory, 'runtime.env');
const accessFile = join(stateDirectory, 'access.json');
const processFile = join(stateDirectory, 'processes.json');
const publicDirectory = join(stateDirectory, 'public');
const landingPublicDirectory = join(stateDirectory, 'public-landing');
const composeArguments = [
  'compose',
  '--project-name',
  'authlane-demo',
  '-f',
  join(root, 'docker/demo-compose.yml'),
];

function secret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function hexSecret() {
  return randomBytes(32).toString('hex');
}

function withoutOptionalProviderSecrets(environment) {
  const sanitized = { ...environment };
  delete sanitized.DEMO_GITHUB_CLIENT_ID;
  delete sanitized.DEMO_GITHUB_CLIENT_SECRET;
  return sanitized;
}

function childEnvironment(extra = {}) {
  return withoutOptionalProviderSecrets({ ...process.env, ...extra });
}

function generatedRuntime() {
  return {
    DEMO_POSTGRES_ADMIN_PASSWORD: secret(),
    DEMO_RUNTIME_DB_PASSWORD: secret(),
    DEMO_WORKER_DB_PASSWORD: secret(),
    DEMO_REDIS_PASSWORD: secret(),
    AUTHLANE_DATA_KEK_RING: `demo-data:${hexSecret()}`,
    AUTHLANE_LOOKUP_KEY_RING: `demo-lookup:${hexSecret()}`,
    AUTHLANE_REDIS_KEY_RING: `demo-redis:${hexSecret()}`,
    BETTER_AUTH_SECRETS: `1:${secret(40)}`,
    METRICS_BEARER_TOKEN: secret(40),
    DEMO_OAUTH_CLIENT_ID: `demo-client-${secret(12)}`,
    DEMO_OAUTH_CLIENT_SECRET: secret(40),
    DEMO_PROVIDER_SIGNING_SECRET: hexSecret(),
  };
}

function serializeEnvironment(environment) {
  return `${Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
}

function parseEnvironment(value) {
  return Object.fromEntries(
    value
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error('Invalid demo runtime file');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

async function secureWrite(path, value) {
  await writeFile(path, value, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600);
}

async function runtimeEnvironment() {
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await chmod(stateDirectory, 0o700);
  try {
    return parseEnvironment(await readFile(runtimeFile, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const environment = generatedRuntime();
    await secureWrite(runtimeFile, serializeEnvironment(environment));
    return environment;
  }
}

function databaseUrls(runtime) {
  return {
    admin: `postgresql://authlane:${runtime.DEMO_POSTGRES_ADMIN_PASSWORD}@127.0.0.1:55432/authlane_demo`,
    runtime: `postgresql://authlane_app:${runtime.DEMO_RUNTIME_DB_PASSWORD}@127.0.0.1:55432/authlane_demo`,
    worker: `postgresql://authlane_job:${runtime.DEMO_WORKER_DB_PASSWORD}@127.0.0.1:55432/authlane_demo`,
  };
}

function command(name, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, {
      cwd: options.cwd ?? root,
      env: options.env ? withoutOptionalProviderSecrets(options.env) : childEnvironment(),
      stdio: options.stdio ?? 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code ?? signal}`));
    });
  });
}

function compose(args, runtime, options = {}) {
  return command('docker', [...composeArguments, ...args], {
    ...options,
    env: options.env ? withoutOptionalProviderSecrets(options.env) : childEnvironment(runtime),
  });
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/**
 * Builds the libraries the migrate and seed scripts import.
 *
 * They run through tsx, which resolves `@authlane/shared` to its built `dist`. On a machine that
 * has built before, that directory already exists and the ordering never shows; on a clean
 * checkout the seed fails with a module-not-found before any of this works.
 */
async function buildLibraries() {
  await command('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@authlane/database...']);
}

async function provisionInfrastructure(runtime) {
  const urls = databaseUrls(runtime);
  await compose(['up', '-d', '--wait'], runtime);
  const migrationEnvironment = childEnvironment({ ...runtime, DATABASE_URL: urls.admin });
  await command('pnpm', ['--filter', '@authlane/database', 'exec', 'tsx', 'src/migrate.ts'], {
    env: migrationEnvironment,
  });
  await command('pnpm', ['--filter', '@authlane/database', 'exec', 'tsx', 'src/seed.ts'], {
    env: migrationEnvironment,
  });
  await compose(
    [
      'exec',
      '-T',
      '-e',
      'DATABASE_URL',
      '-e',
      'AUTHLANE_RUNTIME_DB_PASSWORD',
      '-e',
      'AUTHLANE_WORKER_DB_PASSWORD',
      'postgres',
      '/app/docker/postgres/provision-roles.sh',
    ],
    runtime,
    {
      env: childEnvironment({
        ...runtime,
        DATABASE_URL: `postgresql://authlane:${runtime.DEMO_POSTGRES_ADMIN_PASSWORD}@127.0.0.1:5432/authlane_demo`,
        AUTHLANE_RUNTIME_DB_PASSWORD: runtime.DEMO_RUNTIME_DB_PASSWORD,
        AUTHLANE_WORKER_DB_PASSWORD: runtime.DEMO_WORKER_DB_PASSWORD,
      }),
    }
  );
  return urls;
}

async function buildApplications() {
  await command(
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=@authlane/api',
      '--filter=@authlane/widget',
      '--filter=@authlane/landing',
      '--filter=example-saas',
    ],
    { env: childEnvironment({ VITE_API_URL: '/api/v1/dashboard' }) }
  );
  await command('pnpm', ['--filter', '@authlane/dashboard', 'build'], {
    env: childEnvironment({ VITE_API_URL: '/api/v1/dashboard' }),
  });
  await rm(publicDirectory, { recursive: true, force: true });
  await rm(landingPublicDirectory, { recursive: true, force: true });
  await mkdir(join(publicDirectory, 'connect'), { recursive: true, mode: 0o700 });
  await mkdir(landingPublicDirectory, { recursive: true, mode: 0o700 });
  await cp(join(root, 'apps/dashboard/dist'), publicDirectory, { recursive: true });
  await cp(join(root, 'apps/widget/dist'), join(publicDirectory, 'connect'), { recursive: true });
  await cp(join(root, 'apps/landing/out'), landingPublicDirectory, { recursive: true });
}

async function bootstrap(runtime, urls) {
  process.env.AUTHLANE_DATA_KEK_RING = runtime.AUTHLANE_DATA_KEK_RING;
  process.env.AUTHLANE_LOOKUP_KEY_RING = runtime.AUTHLANE_LOOKUP_KEY_RING;
  const moduleUrl = pathToFileURL(join(root, 'packages/database/dist/index.js')).href;
  const { bootstrapDemo, resetDemoData } = await import(`${moduleUrl}?demo=${Date.now()}`);
  const github =
    process.env.DEMO_GITHUB_CLIENT_ID && process.env.DEMO_GITHUB_CLIENT_SECRET
      ? {
          clientId: process.env.DEMO_GITHUB_CLIENT_ID,
          clientSecret: process.env.DEMO_GITHUB_CLIENT_SECRET,
        }
      : undefined;
  await resetDemoData(urls.admin);
  const access = await bootstrapDemo({
    adminDatabaseUrl: urls.admin,
    oauthClientId: runtime.DEMO_OAUTH_CLIENT_ID,
    oauthClientSecret: runtime.DEMO_OAUTH_CLIENT_SECRET,
    github,
  });
  await secureWrite(accessFile, `${JSON.stringify(access, null, 2)}\n`);
  return { access, githubEnabled: github !== undefined };
}

function startApplications(runtime, urls, access, githubEnabled) {
  const commonEnvironment = childEnvironment({
    ...runtime,
    AUTHLANE_DEMO_MODE: 'true',
    NODE_ENV: 'development',
  });
  const api = spawn(process.execPath, ['apps/api/dist/index.js'], {
    cwd: root,
    env: {
      ...commonEnvironment,
      DATABASE_URL: urls.runtime,
      SYSTEM_DATABASE_URL: urls.worker,
      REDIS_URL: `redis://:${runtime.DEMO_REDIS_PASSWORD}@127.0.0.1:56379/0`,
      API_HOST: '127.0.0.1',
      API_PORT: '3000',
      BETTER_AUTH_URL: 'http://localhost:3000',
      CORS_ORIGIN: 'http://localhost:3000,http://localhost:5175',
      AUTHLANE_PUBLIC_DIR: publicDirectory,
      AUTHLANE_LANDING_DIR: landingPublicDirectory,
      AUTHLANE_LANDING_HOSTS: 'authlane.localhost',
      AUTHLANE_APP_HOSTS: 'app.authlane.localhost',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
    },
    stdio: 'inherit',
  });
  const example = spawn(process.execPath, ['dist-server/index.js'], {
    cwd: join(root, 'apps/example-saas'),
    env: {
      ...commonEnvironment,
      AUTHLANE_API_KEY: access.apiKey,
      AUTHLANE_API_URL: 'http://localhost:3000',
      EXAMPLE_BROWSER_ORIGIN: 'http://localhost:5175',
      EXAMPLE_SERVER_PORT: '5175',
      EXAMPLE_EXTERNAL_USER_ID: access.externalUserId,
      DEMO_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/v1/oauth/authlane-demo/callback',
      EXAMPLE_GITHUB_ENABLED: githubEnabled ? 'true' : 'false',
    },
    stdio: 'inherit',
  });
  return { api, example };
}

async function saveProcesses(children) {
  await secureWrite(
    processFile,
    `${JSON.stringify({ api: children.api.pid, example: children.example.pid })}\n`
  );
}

async function stopRecordedProcesses() {
  try {
    const processes = JSON.parse(await readFile(processFile, 'utf8'));
    for (const pid of [processes.api, processes.example]) {
      if (!Number.isInteger(pid) || pid <= 1) continue;
      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
    await rm(processFile, { force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function stop({ volumes = false } = {}) {
  await stopRecordedProcesses();
  let runtime;
  try {
    runtime = await runtimeEnvironment();
  } catch {
    runtime = generatedRuntime();
  }
  await compose(['down', '--remove-orphans', ...(volumes ? ['--volumes'] : [])], runtime);
  if (volumes) await rm(stateDirectory, { recursive: true, force: true });
}

async function runDemo({ test = false } = {}) {
  const runtime = await runtimeEnvironment();
  let children;
  try {
    await buildLibraries();
    const urls = await provisionInfrastructure(runtime);
    await buildApplications();
    const { access, githubEnabled } = await bootstrap(runtime, urls);
    children = startApplications(runtime, urls, access, githubEnabled);
    await saveProcesses(children);
    await Promise.all([
      waitForUrl('http://localhost:3000/health'),
      waitForUrl('http://localhost:5175/'),
    ]);

    console.log('Authlane demo is ready at http://localhost:5175');
    console.log(`Generated admin credentials: ${accessFile}`);

    if (test) {
      await command('pnpm', ['exec', 'playwright', 'test', '--config=playwright.demo.config.ts'], {
        env: childEnvironment({
          DEMO_ACCESS_FILE: accessFile,
          DEMO_ADMIN_DATABASE_URL: urls.admin,
          AUTHLANE_DEMO_RUNTIME_FILE: runtimeFile,
        }),
      });
      return;
    }

    await new Promise((resolve, reject) => {
      const terminate = () => resolve();
      process.once('SIGINT', terminate);
      process.once('SIGTERM', terminate);
      children.api.once('exit', (code) => reject(new Error(`Authlane API exited with ${code}`)));
      children.example.once('exit', (code) =>
        reject(new Error(`Example SaaS exited with ${code}`))
      );
    });
  } finally {
    if (children) {
      children.api.kill('SIGTERM');
      children.example.kill('SIGTERM');
    }
    await stop();
  }
}

const action = process.argv[2] ?? 'start';
try {
  if (action === 'start') await runDemo();
  else if (action === 'test') await runDemo({ test: true });
  else if (action === 'down') await stop();
  else if (action === 'reset') await stop({ volumes: true });
  else throw new Error(`Unknown demo action: ${action}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Demo command failed');
  process.exitCode = 1;
}

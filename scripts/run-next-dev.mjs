import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

function parseArgs(argv) {
  const args = { defaultPort: 3000, fallbackStartPort: null, maxTries: 50 };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--defaultPort') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid --defaultPort: ${argv[i + 1] ?? ''}`);
      }
      args.defaultPort = value;
      i += 1;
      continue;
    }

    if (token === '--maxTries') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --maxTries: ${argv[i + 1] ?? ''}`);
      }
      args.maxTries = value;
      i += 1;
      continue;
    }

    if (token === '--fallbackStartPort') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --fallbackStartPort: ${argv[i + 1] ?? ''}`);
      }
      args.fallbackStartPort = value;
      i += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }

  return args;
}

async function isPortAvailable(port, host = '0.0.0.0') {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function getFirstAvailablePort(startPort, maxTries) {
  for (let i = 0; i < maxTries; i += 1) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) return port;
  }
  throw new Error(`No free port found in range ${startPort}..${startPort + maxTries - 1}`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    'Usage: node scripts/run-next-dev.mjs --defaultPort 3002 [--fallbackStartPort 3102] [--maxTries 50]'
  );
  process.exit(0);
}

const envPort = process.env.PORT ? Number(process.env.PORT) : null;
const primaryStartPort = Number.isFinite(envPort) ? envPort : args.defaultPort;
let port = await getFirstAvailablePort(primaryStartPort, 1).catch(() => null);

if (port === null) {
  const fallbackStartPort =
    typeof args.fallbackStartPort === 'number' ? args.fallbackStartPort : primaryStartPort + 1;
  port = await getFirstAvailablePort(fallbackStartPort, args.maxTries);
}

if (port !== primaryStartPort) {
  console.warn(`⚠️  Port ${primaryStartPort} is in use, switching to ${port}`);
}

const child = spawn('next', ['dev', '-p', String(port)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: String(port) },
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') process.exit(code);
  if (signal) {
    // 128 + signal number is conventional, but we can't reliably map it here.
    process.exit(1);
  }
  process.exit(0);
});

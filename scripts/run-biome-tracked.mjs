import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';

const supportedCommands = new Set(['check', 'format', 'lint']);
const supportedExtensions = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const chunkSize = 100;

const [command, ...options] = process.argv.slice(2);
if (!command || !supportedCommands.has(command)) {
  console.error('Usage: node scripts/run-biome-tracked.mjs <check|format|lint> [options]');
  process.exit(2);
}

const listedFiles = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'buffer',
  maxBuffer: 16 * 1024 * 1024,
});
if (listedFiles.status !== 0) {
  process.stderr.write(listedFiles.stderr ?? 'Unable to list tracked files.\n');
  process.exit(listedFiles.status ?? 1);
}

const files = listedFiles.stdout
  .toString('utf8')
  .split('\0')
  .filter((file) => file.length > 0 && supportedExtensions.has(extname(file)));

if (files.length === 0) {
  console.error('No tracked files supported by Biome were found.');
  process.exit(1);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
let exitCode = 0;

for (let index = 0; index < files.length; index += chunkSize) {
  const result = spawnSync(
    pnpm,
    ['exec', 'biome', command, ...options, ...files.slice(index, index + chunkSize)],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  }
}

process.exit(exitCode);

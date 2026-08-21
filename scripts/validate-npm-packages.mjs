import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedRepository = 'git+https://github.com/DXHeroes/authlane.git';
const rootLicense = readFileSync(join(repositoryRoot, 'LICENSE'), 'utf8');
const publicPackages = ['packages', 'integrations']
  .flatMap((workspace) =>
    readdirSync(join(repositoryRoot, workspace), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repositoryRoot, workspace, entry.name, 'package.json'))
  )
  .filter(existsSync)
  .map((manifestPath) => ({
    manifestPath,
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
  }))
  .filter(({ manifest }) => manifest.private !== true)
  .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));

if (publicPackages.length === 0) throw new Error('No public packages found');

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportTargets);
}

function packageExports(manifest) {
  if (!manifest.exports) return [['.', manifest.main]];
  if (typeof manifest.exports === 'string') return [['.', manifest.exports]];
  return Object.entries(manifest.exports);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'authlane-npm-release-'));

try {
  const tarballs = [];
  const smokeImports = [];
  const peerDependencies = new Map();

  for (const { manifestPath, manifest } of publicPackages) {
    const packageRoot = dirname(manifestPath);
    const directory = relative(repositoryRoot, packageRoot);
    assert(manifest.license === 'MIT', `${manifest.name}: license must be MIT`);
    assert(manifest.repository?.type === 'git', `${manifest.name}: repository.type must be git`);
    assert(
      manifest.repository?.url === expectedRepository,
      `${manifest.name}: repository URL mismatch`
    );
    assert(
      manifest.repository?.directory === directory,
      `${manifest.name}: repository directory mismatch`
    );
    assert(manifest.homepage === 'https://authlane.io/docs', `${manifest.name}: homepage mismatch`);
    assert(
      manifest.bugs?.url === 'https://github.com/DXHeroes/authlane/issues',
      `${manifest.name}: bugs URL mismatch`
    );
    assert(manifest.publishConfig?.access === 'public', `${manifest.name}: public access missing`);
    assert(
      Array.isArray(manifest.files) && manifest.files.length > 0,
      `${manifest.name}: files missing`
    );
    assert(manifest.files.includes('README.md'), `${manifest.name}: README.md allowlist missing`);
    assert(manifest.files.includes('LICENSE'), `${manifest.name}: LICENSE allowlist missing`);
    assert(existsSync(join(packageRoot, 'README.md')), `${manifest.name}: README.md missing`);
    assert(existsSync(join(packageRoot, 'LICENSE')), `${manifest.name}: LICENSE missing`);
    assert(
      readFileSync(join(packageRoot, 'LICENSE'), 'utf8') === rootLicense,
      `${manifest.name}: LICENSE differs from root MIT text`
    );
    for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
      peerDependencies.set(name, range);
    }

    for (const [subpath, declaration] of packageExports(manifest)) {
      const targets = exportTargets(declaration);
      assert(targets.length > 0, `${manifest.name}${subpath}: no export target`);
      for (const target of targets) {
        assert(target.startsWith('./'), `${manifest.name}${subpath}: export must be relative`);
        assert(
          existsSync(join(packageRoot, target)),
          `${manifest.name}${subpath}: missing ${target}`
        );
      }
      const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
      const runtimeTarget = targets.find((target) => !target.endsWith('.d.ts'));
      if (runtimeTarget?.endsWith('.json')) {
        smokeImports.push(
          `await import(${JSON.stringify(specifier)}, { with: { type: 'json' } });`
        );
      } else if (runtimeTarget) {
        smokeImports.push(`await import(${JSON.stringify(specifier)});`);
      }
    }

    const dryRun = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: packageRoot,
        encoding: 'utf8',
      })
    );
    const files = dryRun[0]?.files?.map(({ path }) => path) ?? [];
    assert(files.length > 0, `${manifest.name}: dry-run inventory is empty`);
    assert(files.includes('README.md'), `${manifest.name}: packed README.md missing`);
    assert(files.includes('LICENSE'), `${manifest.name}: packed LICENSE missing`);
    for (const file of files) {
      assert(
        !/(^|\/)(?:\.env|tests?|fixtures?|__pycache__|node_modules)(?:\/|$)/i.test(file),
        `${manifest.name}: unexpected ${file}`
      );
      assert(
        !/(^|\/)(?:\.cache|\.pytest_cache|\.mypy_cache|\.ruff_cache)(?:\/|$)/i.test(file),
        `${manifest.name}: cache file ${file}`
      );
      assert(!/\.(?:pem|key|p12|pfx)$/i.test(file), `${manifest.name}: secret-like file ${file}`);
      assert(!/(^|\/)src\//.test(file), `${manifest.name}: source file ${file}`);
    }

    const output = execFileSync('pnpm', ['pack', '--pack-destination', temporaryRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
    }).trim();
    const tarball = output.split('\n').at(-1);
    assert(tarball && existsSync(tarball), `${manifest.name}: real tarball was not created`);
    const archiveFiles = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' })
      .trim()
      .split('\n');
    const packedManifest = JSON.parse(
      execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' })
    );
    const packedLicense = execFileSync('tar', ['-xOf', tarball, 'package/LICENSE'], {
      encoding: 'utf8',
    });
    assert(archiveFiles.includes('package/README.md'), `${manifest.name}: real README.md missing`);
    assert(
      packedLicense === rootLicense,
      `${manifest.name}: real LICENSE differs from root MIT text`
    );
    assert(
      !JSON.stringify(packedManifest).includes('workspace:'),
      `${manifest.name}: workspace protocol leaked`
    );
    for (const [, declaration] of packageExports(packedManifest)) {
      for (const target of exportTargets(declaration)) {
        assert(
          archiveFiles.includes(`package/${target.slice(2)}`),
          `${manifest.name}: packed export missing ${target}`
        );
      }
    }
    tarballs.push(tarball);
    process.stdout.write(`${manifest.name}: ${files.length} files\n`);
  }

  const fixture = join(temporaryRoot, 'fixture');
  writeFileSync(
    join(temporaryRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`
  );
  const peers = [...peerDependencies].map(([name, range]) => `${name}@${range}`);
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs, ...peers],
    {
      cwd: temporaryRoot,
      stdio: 'inherit',
    }
  );
  writeFileSync(fixture, `${smokeImports.join('\n')}\n`);
  execFileSync('node', [fixture], { cwd: temporaryRoot, stdio: 'inherit' });
  process.stdout.write(
    `Validated ${publicPackages.length} public packages and ${smokeImports.length} exports.\n`
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

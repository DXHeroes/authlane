import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const publicOriginVariables = [
  'APP_URL',
  'BETTER_AUTH_URL',
  'CORS_ORIGIN',
  'AUTHLANE_LANDING_HOSTS',
  'AUTHLANE_APP_HOSTS',
  'AUTHLANE_ALLOW_SIGNUP',
  'AUTHLANE_AUTH_MODE',
] as const;

const sandboxModelVariables = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
] as const;

describe('Coolify runtime configuration', () => {
  it('copies every documentation contract input before landing checks run', async () => {
    const dockerfile = await readFile(new URL('../apps/api/Dockerfile', import.meta.url), 'utf8');
    const landingBuildIndex = dockerfile.indexOf('pnpm --filter @authlane/landing build');

    for (const copyInstruction of [
      'COPY README.md ./',
      'COPY .claude-plugin ./.claude-plugin',
      'COPY .agents/plugins ./.agents/plugins',
      'COPY .cursor-plugin ./.cursor-plugin',
      'COPY plugins/authlane ./plugins/authlane',
    ]) {
      const copyIndex = dockerfile.indexOf(copyInstruction);

      expect(copyIndex, copyInstruction).toBeGreaterThanOrEqual(0);
      expect(landingBuildIndex, copyInstruction).toBeGreaterThan(copyIndex);
    }
  });

  it('passes every public origin and host policy variable directly to the app', async () => {
    const compose = await readFile(
      new URL('../docker-compose.coolify.yml', import.meta.url),
      'utf8'
    );

    for (const variable of publicOriginVariables) {
      expect(compose).toMatch(new RegExp(`^  ${variable}:$`, 'm'));
    }
    expect(compose).not.toMatch(/export BETTER_AUTH_URL=/);
  });

  it('passes optional Sandbox model credentials directly to the app', async () => {
    const compose = await readFile(
      new URL('../docker-compose.coolify.yml', import.meta.url),
      'utf8'
    );

    for (const variable of sandboxModelVariables) {
      expect(compose).toMatch(new RegExp(`^  ${variable}:$`, 'm'));
    }
  });

  it('keeps one control-plane runtime and no provider execution service', async () => {
    const compose = await readFile(
      new URL('../docker-compose.coolify.yml', import.meta.url),
      'utf8'
    );
    const servicesSection = compose.match(/^services:\n([\s\S]*?)^volumes:/m)?.[1] ?? '';
    const serviceNames = [...servicesSection.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map(
      ([, name]) => name
    );

    expect(serviceNames).toEqual(['migrate', 'app', 'postgres', 'redis']);
    expect(serviceNames).not.toEqual(
      expect.arrayContaining(['gateway', 'mcp', 'provider', 'worker'])
    );
    expect(compose).toContain('exec node apps/api/dist/index.js');
  });

  it('gives persisted Redis enough startup headroom for legacy queue data', async () => {
    const compose = await readFile(
      new URL('../docker-compose.coolify.yml', import.meta.url),
      'utf8'
    );
    const redisService = compose.match(/^ {2}redis:\n([\s\S]*?)(?=^volumes:)/m)?.[1] ?? '';

    expect(redisService).toContain('start_period: 30s');
    expect(redisService).toContain('memory: 1G');
  });

  it('documents safe production host and signup defaults', async () => {
    const exampleEnvironment = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
    const values = new Map(
      exampleEnvironment
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)] as const;
        })
    );

    expect(values.get('APP_URL')).toBe('https://app.authlane.io');
    expect(values.get('BETTER_AUTH_URL')).toBe('https://app.authlane.io');
    expect(values.get('CORS_ORIGIN')).toBe('https://app.authlane.io');
    expect(values.get('AUTHLANE_LANDING_HOSTS')).toBe('authlane.io');
    expect(values.get('AUTHLANE_APP_HOSTS')).toBe('app.authlane.io');
    expect(values.get('AUTHLANE_ALLOW_SIGNUP')).toBe('false');
    expect(values.get('AUTHLANE_AUTH_MODE')).toBe('email-password');
  });
});

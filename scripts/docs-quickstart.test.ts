import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const quickstartUrl = new URL('../apps/docs/quickstart.mdx', import.meta.url);
const oauthGuideUrl = new URL('../apps/docs/guides/oauth-setup.mdx', import.meta.url);
const customIntegrationsUrl = new URL(
  '../apps/docs/guides/custom-integrations.mdx',
  import.meta.url
);
const frameworksUrl = new URL('../apps/docs/sdk/frameworks.mdx', import.meta.url);
const pythonSdkUrl = new URL('../apps/docs/sdk/python.mdx', import.meta.url);
const mastraSdkUrl = new URL('../apps/docs/sdk/mastra.mdx', import.meta.url);
const typescriptSdkUrl = new URL('../apps/docs/sdk/typescript.mdx', import.meta.url);

describe('task-oriented documentation content', () => {
  it('keeps the quickstart on the five complete first-success steps', async () => {
    const quickstart = await readFile(quickstartUrl, 'utf8');

    expect(quickstart).toContain("import { Authlane } from '@authlane/sdk'");
    expect(quickstart).toContain('const authlane = new Authlane({');
    expect(quickstart).toContain('allowedServices: []');
    expect(quickstart).toContain('.user(userId)');
    expect(quickstart).not.toContain('const MAX_CHAT_REQUEST_BYTES');

    const headings = [
      '## 1. Initialize Authlane on your server',
      '## 2. List the services your tenant enabled',
      '## 3. Create a connect session for the signed-in user',
      '## 4. Render the hosted connect UI',
      "## 5. Give this user's tools to your AI runtime",
    ];
    expect(headings.map((heading) => quickstart.indexOf(heading))).toEqual(
      [...headings]
        .map((heading) => quickstart.indexOf(heading))
        .sort((left, right) => left - right)
    );
  });

  it('keeps the service-list example inside a complete exported server function', async () => {
    const quickstart = await readFile(quickstartUrl, 'utf8');
    const listSection = quickstart.slice(
      quickstart.indexOf('## 2. List the services your tenant enabled'),
      quickstart.indexOf('## 3. Create a connect session for the signed-in user')
    );

    // The example must show the non-throwing shape: the error is returned, never swallowed.
    expect(listSection).toContain('export async function listServices() {');
    expect(listSection).toContain('if (error) return { data: null, error };');
    expect(listSection).toContain('  return { data: services, error: null };\n}');
    expect(listSection.indexOf('if (error) return')).toBeLessThan(
      listSection.indexOf('return { data: services, error: null };')
    );
  });

  it('uses safe child CodeGroups and the required Mastra Agent instructions', async () => {
    const [quickstart, mastraSdk] = await Promise.all([
      readFile(quickstartUrl, 'utf8'),
      readFile(mastraSdkUrl, 'utf8'),
    ]);

    expect(quickstart.match(/<CodeGroup>/g)).toHaveLength(2);
    expect(quickstart.match(/<CodeGroupItem label="Vercel AI">/g)).toHaveLength(2);
    expect(quickstart).not.toContain('labels={');
    expect(quickstart).not.toContain('languages={');
    expect(quickstart).not.toContain('sources={');
    expect(quickstart).toContain("instructions: 'Use connected tools.',");
    expect(mastraSdk).toContain("instructions: 'Use connected tools.',");
    expect(quickstart.indexOf("instructions: 'Use connected tools.',")).toBeLessThan(
      quickstart.indexOf("model: 'openai/gpt-5-mini'", quickstart.indexOf('new Agent({'))
    );
  });

  it('keeps TypeScript SDK examples on explicit data and error bindings', async () => {
    const sdk = await readFile(typescriptSdkUrl, 'utf8');

    expect(sdk).toContain('const { data: connections, error: connectionsError } =');
    expect(sdk).toContain('const { data: definitions, error: definitionsError } =');
    expect(sdk).toContain('const { data: customTools, error: customToolsError } =');
    expect(sdk).toContain('const { data: session, error: sessionError } =');
    expect(sdk).toContain('const { data: services, error: servicesError } =');
    // A result must never be bound without its error being named alongside it.
    expect(sdk).not.toMatch(
      /const (?:capabilities|connections|definitions|result|session) = await (?:authlane|user\.)/
    );
    expect(sdk).not.toMatch(/^await authlane\./m);
  });

  it('initializes Authlane and handles the connect-session error in the OAuth guide', async () => {
    const guide = await readFile(oauthGuideUrl, 'utf8');

    expect(guide).toContain("import { Authlane } from '@authlane/sdk';");
    expect(guide).toContain('const authlane = new Authlane({');
    expect(guide).toContain('const { data, error } = await authlane.connectSessions.create({');
    expect(guide).toContain('if (error) {');
    expect(guide.indexOf('new Authlane({')).toBeLessThan(
      guide.indexOf('authlane.connectSessions.create({')
    );
  });

  it('unwraps every Python framework adapter Result before assigning tools', async () => {
    const frameworks = await readFile(frameworksUrl, 'utf8');
    const python = frameworks.slice(frameworks.indexOf('## Python'));

    for (const name of ['agno', 'langchain', 'openai', 'portable']) {
      expect(python).toContain(`${name}_result = user.tools.list(`);
      expect(python).toContain(`if ${name}_result.error is not None:`);
      expect(python).toContain(`assert ${name}_result.data is not None`);
      expect(python).toContain(`${name}_tools = ${name}_result.data`);
    }
    expect(python).not.toMatch(/\w+_tools = user\.tools\.list\(/);
  });

  it('creates and unwraps Python connect sessions inside a live client context', async () => {
    const sdk = await readFile(pythonSdkUrl, 'utf8');
    const connectSection = sdk.slice(
      sdk.indexOf('## Connect an external user'),
      sdk.indexOf('## Load user-scoped tools')
    );

    expect(connectSection).toContain('with Authlane(');
    expect(connectSection).toMatch(/^ {4}session_result = authlane\.connect_sessions\.create\(/m);
    expect(connectSection).toContain('if session_result.error is not None:');
    expect(connectSection).toContain('assert session_result.data is not None');
    expect(connectSection).toContain('session = session_result.data');
    expect(connectSection).not.toMatch(/^session = authlane\.connect_sessions\.create\(/m);
    expect(connectSection.indexOf('with Authlane(')).toBeLessThan(
      connectSection.indexOf('authlane.connect_sessions.create(')
    );
  });

  it('initializes Authlane before issuing a custom-integration credential lease', async () => {
    const guide = await readFile(customIntegrationsUrl, 'utf8');
    const executeSection = guide.slice(guide.indexOf('## Execute in the SaaS'));

    expect(executeSection).toContain("import { Authlane } from '@authlane/sdk';");
    expect(executeSection).toContain('const authlane = new Authlane({');
    expect(executeSection).toContain(
      'const { data: credentials, error } = await authlane.credentialLeases.create({'
    );
    expect(executeSection).toContain('if (error) {');
    expect(executeSection.indexOf('new Authlane({')).toBeLessThan(
      executeSection.indexOf('authlane.credentialLeases.create({')
    );
  });
});

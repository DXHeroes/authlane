/* biome-ignore-all lint/a11y/noRedundantRoles: Explicit list roles preserve semantics after the visual reset. */
/* biome-ignore-all lint/a11y/useSemanticElements: These roles are applied to their native list elements. */
'use client';

import type { KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import { developerSteps } from '../content';
import { highlightCode } from '../lib/highlight-code';

const catalogSamples = {
  sdk: `import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

const { data: services, error } = await authlane.services.list();
if (error) {
  console.error('Could not load services', error.message);
  return [];
}
return services;`,
  api: `curl https://app.authlane.io/api/v1/catalog/services \\
  -H "Authorization: Bearer $AUTHLANE_API_KEY"`,
} as const;

const frameworkSamples = {
  vercel: `import { vercelAI } from '@authlane/ai/vercel';

const user = authlane.user('user_123');
const { data: tools, error } = await user.tools.list({ adapter: vercelAI() });
if (error) {
  return Response.json({ message: error.message }, { status: 502 });
}
return streamText({ model, messages, tools });`,
  openai: `import { openAIAgents } from '@authlane/ai/openai';

const user = authlane.user('user_123');
const { data: tools, error } = await user.tools.list({ adapter: openAIAgents() });
if (error) {
  return Response.json({ message: error.message }, { status: 502 });
}
const agent = new Agent({ name: 'Support', tools });`,
  mastra: `import { mastraAI } from '@authlane/ai/mastra';

const user = authlane.user('user_123');
const { data: tools, error } = await user.tools.list({ adapter: mastraAI() });
if (error) {
  throw new Error(error.message);
}
const agent = new Agent({ name: 'Support', tools });`,
  mcp: `import { mcpServer } from '@authlane/ai/mcp';

const user = authlane.user('user_123');
const { data: server, error } = await user.tools.list({ adapter: mcpServer() });
if (error) {
  console.error('Could not create MCP server', error.message);
  return;
}
await server.connect(transport);`,
} as const;

const servicePickerSample = `<ServicePicker
  services={services}
  onConnect={(serviceId) => connectUser(serviceId)}
/>`;

const connectSessionSample = `const { data: session, error } = await authlane.connectSessions.create({
  externalUserId: 'user_123',
  allowedServices: [],
  allowedOrigin: 'https://app.example.com',
  expiresInSeconds: 600,
});
if (error) {
  return <ConnectError message={error.message} />;
}

return <AuthlaneConnect connectUrl={session.url} onEvent={refreshConnections} />;`;

type TabOption = {
  id: string;
  label: string;
  code: string;
  language: string;
};

type CodeTabsProps = {
  id: string;
  label: string;
  options: readonly TabOption[];
};

function CodeTabs({ id, label, options }: CodeTabsProps) {
  const [activeTab, setActiveTab] = useState(options[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = (index: number) => {
    const nextTab = options[index];
    setActiveTab(nextTab.id);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;

    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(nextIndex);
  };

  return (
    <div className="code-tabs">
      <div className="code-tabs__list" role="tablist" aria-label={label}>
        {options.map((option, index) => {
          const isActive = activeTab === option.id;
          return (
            <button
              key={option.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${id}-tab-${option.id}`}
              className="code-tabs__tab"
              type="button"
              role="tab"
              aria-controls={`${id}-panel-${option.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {options.map((option) => {
        const isActive = activeTab === option.id;
        return (
          <div
            key={option.id}
            id={`${id}-panel-${option.id}`}
            className="code-tabs__panel"
            role="tabpanel"
            aria-labelledby={`${id}-tab-${option.id}`}
            hidden={!isActive}
          >
            <pre className="code-sample">
              <code
                className={`language-${option.language}`}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism escapes repository-owned static samples.
                dangerouslySetInnerHTML={{
                  __html: highlightCode(option.code, option.language),
                }}
              />
            </pre>
          </div>
        );
      })}
    </div>
  );
}

const catalogOptions = [
  { id: 'sdk', label: 'SDK', code: catalogSamples.sdk, language: 'typescript' },
  { id: 'api', label: 'REST API', code: catalogSamples.api, language: 'bash' },
] as const;

const frameworkOptions = [
  { id: 'vercel', label: 'Vercel AI SDK', code: frameworkSamples.vercel, language: 'typescript' },
  { id: 'openai', label: 'OpenAI Agents', code: frameworkSamples.openai, language: 'typescript' },
  { id: 'mastra', label: 'Mastra', code: frameworkSamples.mastra, language: 'typescript' },
  { id: 'mcp', label: 'Local MCP server', code: frameworkSamples.mcp, language: 'typescript' },
] as const;

function HighlightedCode({ code, language }: { code: string; language: string }) {
  return (
    <pre className="code-sample">
      <code
        className={`language-${language}`}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Prism escapes repository-owned static samples.
        dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
      />
    </pre>
  );
}

export function DeveloperJourney() {
  return (
    <section
      id="how-it-works"
      className="developer-journey section-shell"
      aria-labelledby="journey-title"
    >
      <div className="container">
        <div className="section-heading">
          <p className="mono eyebrow">Developer journey</p>
          <h2 id="journey-title">First success, not first configuration</h2>
          <p className="section-heading__description">
            Load the catalog on your server, compose the UI in your product, connect an external
            user, and hand that user&apos;s executable tools to your framework.
          </p>
        </div>

        <ol
          className="journey-steps"
          role="list"
          aria-label="Four-step Authlane integration journey"
        >
          {developerSteps.map((step) => (
            <li key={step.id} className="journey-step" data-journey-step={step.id}>
              <p className="mono journey-step__index">{step.index}</p>
              <h3 id={`journey-step-${step.id}`}>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>

        <div id="sdks" className="developer-workbench">
          <section
            className="developer-workbench__step"
            aria-labelledby="journey-step-load-services"
          >
            <p className="mono workbench-label">Server-only catalog</p>
            <CodeTabs id="catalog" label="Catalog code samples" options={catalogOptions} />
            <p className="workbench-note">
              Keep the tenant API key in trusted backend code. The browser receives safe service
              records, never the key.
            </p>
          </section>

          <section
            className="developer-workbench__step"
            aria-labelledby="journey-step-offer-services"
          >
            <p className="mono workbench-label">Your integrations UI</p>
            <HighlightedCode code={servicePickerSample} language="tsx" />
            <p className="workbench-note">
              Authlane supplies the catalog. Your product owns layout, copy, filtering, and
              behavior.
            </p>
          </section>

          <section
            className="developer-workbench__step"
            aria-labelledby="journey-step-connect-user"
          >
            <p className="mono workbench-label">Origin-bound hosted connect</p>
            <HighlightedCode code={connectSessionSample} language="tsx" />
            <p className="workbench-note">
              The short-lived session binds your signed-in external user, service allowlist, and
              exact parent origin. An empty list allows every tenant-enabled service; pass explicit
              IDs when this screen should offer only a subset.
            </p>
          </section>

          <section className="developer-workbench__step" aria-labelledby="journey-step-use-tools">
            <p className="mono workbench-label">User-scoped framework output</p>
            <CodeTabs id="framework" label="Framework code samples" options={frameworkOptions} />
            <p className="workbench-note">
              Each executor runs in your trusted SaaS runtime and requests an access-only lease only
              when the selected tool executes. The MCP adapter creates a local, in-process server
              there; Authlane does not expose or host an MCP server.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

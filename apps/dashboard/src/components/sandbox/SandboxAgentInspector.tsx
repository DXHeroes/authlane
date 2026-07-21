import { CommandLineIcon } from '@heroicons/react/16/solid';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import type { AgentRunSnapshot } from './agent-thread';

const tabs = [
  { id: 'latest', label: 'Latest' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'tools', label: 'Tool calls' },
] as const;

type InspectorTab = (typeof tabs)[number]['id'];

function inspectorValue(tab: InspectorTab, snapshot: AgentRunSnapshot | null): unknown {
  if (!snapshot) return null;
  if (tab === 'request') return snapshot.request;
  if (tab === 'response') return snapshot.response ?? snapshot.error ?? null;
  if (tab === 'tools') return snapshot.toolActivity;
  return {
    request: snapshot.request,
    response: snapshot.response,
    error: snapshot.error,
    toolActivity: snapshot.toolActivity,
  };
}

export function SandboxAgentInspector({ snapshot }: { snapshot: AgentRunSnapshot | null }) {
  const instanceId = useId();
  const [activeTab, setActiveTab] = useState<InspectorTab>('latest');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const value = inspectorValue(activeTab, snapshot);

  function selectTab(index: number) {
    const next = tabs[index];
    if (!next) return;
    setActiveTab(next.id);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(nextIndex);
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const active = tabs[activeIndex] ?? tabs[0];

  return (
    <aside className="min-w-0 self-start overflow-hidden rounded-lg bg-neutral-950 text-neutral-100 ring-1 ring-black/10 dark:ring-white/10 @5xl:sticky @5xl:top-6">
      <div className="flex items-center gap-2 border-b border-white/10 p-3">
        <CommandLineIcon className="size-4 shrink-0 fill-neutral-400" aria-hidden="true" />
        <h2 className="font-mono text-base font-medium sm:text-sm">Run JSON</h2>
      </div>

      <div
        className="flex max-w-full gap-1 overflow-x-auto border-b border-white/10 p-1.5"
        role="tablist"
        aria-label="Agent run JSON"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab;
          const tabId = `${instanceId}-${tab.id}-tab`;
          const panelId = `${instanceId}-${tab.id}-panel`;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`relative shrink-0 rounded-md px-3 py-2.5 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:py-2 sm:text-sm ${
                selected
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100'
              }`}
            >
              {tab.label}
              <span
                className="absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <pre
        id={`${instanceId}-${active.id}-panel`}
        role="tabpanel"
        aria-labelledby={`${instanceId}-${active.id}-tab`}
        className="max-h-[36rem] min-h-80 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-base text-neutral-300 sm:text-sm"
      >
        {value === null ? 'Run the agent to inspect its JSON.' : JSON.stringify(value, null, 2)}
      </pre>
    </aside>
  );
}

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentRunSnapshot } from '@/components/sandbox/agent-thread';
import { SandboxAgentInspector } from '@/components/sandbox/SandboxAgentInspector';
import { render } from '../utils/test-utils';

const snapshot: AgentRunSnapshot = {
  id: 'run_1',
  request: {
    externalUserId: 'sandbox_user',
    provider: 'google',
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'hello' }],
  },
  response: {
    status: 'succeeded',
    text: 'hi',
    finishReason: 'stop',
    usage: { totalTokens: 2 },
    responseMessages: [{ role: 'assistant', content: 'hi' }],
  },
  toolActivity: [{ type: 'tool-call', toolName: 'github_list_repositories' }],
};

describe('SandboxAgentInspector', () => {
  it('shows an explicit empty state before the first run', () => {
    render(<SandboxAgentInspector snapshot={null} />);

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Run the agent to inspect its JSON.');
  });

  it('switches between exact request, response, and tool JSON', () => {
    render(<SandboxAgentInspector snapshot={snapshot} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Request' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('sandbox_user');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('gemini-2.5-flash');

    fireEvent.click(screen.getByRole('tab', { name: 'Response' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('totalTokens');

    fireEvent.click(screen.getByRole('tab', { name: 'Tool calls' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('github_list_repositories');
  });

  it('supports arrow, Home, and End keyboard navigation', () => {
    render(<SandboxAgentInspector snapshot={snapshot} />);
    const latest = screen.getByRole('tab', { name: 'Latest' });
    latest.focus();

    fireEvent.keyDown(latest, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Request' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Request' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Request' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Tool calls' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tool calls' }), { key: 'Home' });
    expect(latest).toHaveFocus();
  });
});

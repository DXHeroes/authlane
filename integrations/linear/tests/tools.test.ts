import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Linear Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'lin_api_test_token_123',
    token_type: 'Bearer',
    scope: 'read write',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('linear_create_issue', () => {
    it('has correct tool definition', () => {
      const tool = tools.linear_create_issue;
      expect(tool.definition.name).toBe('linear_create_issue');
      expect(tool.definition.description).toContain('Creates a new issue');
      expect(tool.definition.inputSchema.required).toEqual(['title', 'teamId']);
    });

    it('creates an issue successfully', async () => {
      const mockResponse = {
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'issue-123',
              identifier: 'ENG-123',
              title: 'Test Issue',
              url: 'https://linear.app/team/issue/ENG-123',
            },
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.linear_create_issue.handler(
        {
          title: 'Test Issue',
          teamId: 'team-123',
          description: 'Test description',
          priority: 1,
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse.data);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer lin_api_test_token_123',
            'Content-Type': 'application/json',
          }),
        })
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('mutation IssueCreate');
      expect(callBody.variables.input.title).toBe('Test Issue');
      expect(callBody.variables.input.teamId).toBe('team-123');
    });

    it('creates issue with optional parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { issueCreate: { success: true } } }),
      } as Response);

      await tools.linear_create_issue.handler(
        {
          title: 'Complex Issue',
          teamId: 'team-123',
          description: 'Full description',
          priority: 2,
          assigneeId: 'user-456',
          labelIds: ['label-1', 'label-2'],
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.variables.input.description).toBe('Full description');
      expect(callBody.variables.input.priority).toBe(2);
      expect(callBody.variables.input.assigneeId).toBe('user-456');
      expect(callBody.variables.input.labelIds).toEqual(['label-1', 'label-2']);
    });

    it('handles Linear API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Team not found' }],
        }),
      } as Response);

      await expect(
        tools.linear_create_issue.handler({ title: 'Test', teamId: 'invalid' }, mockCredentials)
      ).rejects.toThrow('Linear API error: Team not found');
    });
  });

  describe('linear_list_issues', () => {
    it('has correct tool definition', () => {
      const tool = tools.linear_list_issues;
      expect(tool.definition.name).toBe('linear_list_issues');
      expect(tool.definition.description).toContain('Lists issues');
      expect(tool.definition.inputSchema.required).toEqual([]);
    });

    it('lists issues with default parameters', async () => {
      const mockResponse = {
        data: {
          issues: {
            nodes: [
              {
                id: 'issue-1',
                identifier: 'ENG-1',
                title: 'Issue 1',
                state: { name: 'In Progress', type: 'started' },
              },
              {
                id: 'issue-2',
                identifier: 'ENG-2',
                title: 'Issue 2',
                state: { name: 'Done', type: 'completed' },
              },
            ],
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.linear_list_issues.handler({}, mockCredentials);

      expect(result).toEqual(mockResponse.data);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.any(Object)
      );
    });

    it('filters issues by team and assignee', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { issues: { nodes: [] } } }),
      } as Response);

      await tools.linear_list_issues.handler(
        {
          teamId: 'team-123',
          assigneeId: 'user-456',
          limit: 100,
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('query Issues');
      expect(callBody.query).toContain('team-123');
      expect(callBody.query).toContain('user-456');
      expect(callBody.query).toContain('first: 100');
    });

    it('limits maximum to 250', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { issues: { nodes: [] } } }),
      } as Response);

      await tools.linear_list_issues.handler({ limit: 1000 }, mockCredentials);

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('first: 250');
    });
  });

  describe('linear_update_issue', () => {
    it('has correct tool definition', () => {
      const tool = tools.linear_update_issue;
      expect(tool.definition.name).toBe('linear_update_issue');
      expect(tool.definition.description).toContain('Updates an existing issue');
      expect(tool.definition.inputSchema.required).toEqual(['issueId']);
    });

    it('updates issue successfully', async () => {
      const mockResponse = {
        data: {
          issueUpdate: {
            success: true,
            issue: {
              id: 'issue-123',
              identifier: 'ENG-123',
              title: 'Updated Title',
              url: 'https://linear.app/team/issue/ENG-123',
            },
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.linear_update_issue.handler(
        {
          issueId: 'issue-123',
          title: 'Updated Title',
          priority: 3,
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('updates issue with all optional parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { issueUpdate: { success: true } } }),
      } as Response);

      await tools.linear_update_issue.handler(
        {
          issueId: 'issue-123',
          title: 'New Title',
          description: 'New Description',
          priority: 1,
          assigneeId: 'user-789',
          stateId: 'state-completed',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('mutation IssueUpdate');
      expect(callBody.variables.id).toBe('issue-123');
      expect(callBody.variables.input.title).toBe('New Title');
      expect(callBody.variables.input.description).toBe('New Description');
      expect(callBody.variables.input.priority).toBe(1);
      expect(callBody.variables.input.assigneeId).toBe('user-789');
      expect(callBody.variables.input.stateId).toBe('state-completed');
    });

    it('updates only specified fields', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { issueUpdate: { success: true } } }),
      } as Response);

      await tools.linear_update_issue.handler(
        {
          issueId: 'issue-123',
          title: 'Only Title Update',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.variables.input.title).toBe('Only Title Update');
      expect(callBody.variables.input.description).toBeUndefined();
      expect(callBody.variables.input.assigneeId).toBeUndefined();
    });
  });

  describe('linear_list_projects', () => {
    it('has correct tool definition', () => {
      const tool = tools.linear_list_projects;
      expect(tool.definition.name).toBe('linear_list_projects');
      expect(tool.definition.description).toContain('Lists projects');
      expect(tool.definition.inputSchema.required).toEqual([]);
    });

    it('lists projects successfully', async () => {
      const mockResponse = {
        data: {
          projects: {
            nodes: [
              {
                id: 'proj-1',
                name: 'Project Alpha',
                state: 'started',
                progress: 0.45,
              },
              {
                id: 'proj-2',
                name: 'Project Beta',
                state: 'planned',
                progress: 0,
              },
            ],
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.linear_list_projects.handler({}, mockCredentials);

      expect(result).toEqual(mockResponse.data);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.any(Object)
      );
    });

    it('filters projects by team', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { projects: { nodes: [] } } }),
      } as Response);

      await tools.linear_list_projects.handler(
        {
          teamId: 'team-123',
          limit: 25,
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('query Projects');
      expect(callBody.query).toContain('team-123');
      expect(callBody.query).toContain('first: 25');
    });

    it('respects limit parameter', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { projects: { nodes: [] } } }),
      } as Response);

      await tools.linear_list_projects.handler({ limit: 200 }, mockCredentials);

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('first: 200');
    });
  });

  describe('linear_create_project', () => {
    it('has correct tool definition', () => {
      const tool = tools.linear_create_project;
      expect(tool.definition.name).toBe('linear_create_project');
      expect(tool.definition.description).toContain('Creates a new project');
      expect(tool.definition.inputSchema.required).toEqual(['name', 'teamIds']);
    });

    it('creates a project successfully', async () => {
      const mockResponse = {
        data: {
          projectCreate: {
            success: true,
            project: {
              id: 'proj-123',
              name: 'New Project',
              url: 'https://linear.app/team/project/new-project',
            },
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.linear_create_project.handler(
        {
          name: 'New Project',
          teamIds: ['team-1', 'team-2'],
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse.data);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer lin_api_test_token_123',
          }),
        })
      );
    });

    it('creates project with optional parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { projectCreate: { success: true } } }),
      } as Response);

      await tools.linear_create_project.handler(
        {
          name: 'Complete Project',
          teamIds: ['team-1'],
          description: 'Detailed project description',
          leadId: 'user-lead',
          targetDate: '2025-12-31',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.query).toContain('mutation ProjectCreate');
      expect(callBody.variables.input.name).toBe('Complete Project');
      expect(callBody.variables.input.teamIds).toEqual(['team-1']);
      expect(callBody.variables.input.description).toBe('Detailed project description');
      expect(callBody.variables.input.leadId).toBe('user-lead');
      expect(callBody.variables.input.targetDate).toBe('2025-12-31');
    });

    it('works with minimal required parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { projectCreate: { success: true } } }),
      } as Response);

      await tools.linear_create_project.handler(
        {
          name: 'Minimal Project',
          teamIds: ['team-1'],
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.variables.input.name).toBe('Minimal Project');
      expect(callBody.variables.input.teamIds).toEqual(['team-1']);
      expect(callBody.variables.input.description).toBeUndefined();
      expect(callBody.variables.input.leadId).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        tools.linear_create_issue.handler({ title: 'Test', teamId: 'team-1' }, mockCredentials)
      ).rejects.toThrow('Network failure');
    });

    it('handles GraphQL errors without error message', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{}],
        }),
      } as Response);

      await expect(
        tools.linear_create_issue.handler({ title: 'Test', teamId: 'team-1' }, mockCredentials)
      ).rejects.toThrow('Linear API error: undefined');
    });

    it('handles multiple GraphQL errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'First error' }, { message: 'Second error' }],
        }),
      } as Response);

      await expect(
        tools.linear_create_issue.handler({ title: 'Test', teamId: 'team-1' }, mockCredentials)
      ).rejects.toThrow('Linear API error: First error');
    });
  });

  describe('Authentication', () => {
    it('includes OAuth token in all requests', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      } as Response);

      const testCases = [
        () => tools.linear_create_issue.handler({ title: 'Test', teamId: 't' }, mockCredentials),
        () => tools.linear_list_issues.handler({}, mockCredentials),
        () => tools.linear_list_projects.handler({}, mockCredentials),
      ];

      for (const testCase of testCases) {
        await testCase();
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.linear.app/graphql',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer lin_api_test_token_123',
            }),
          })
        );
        vi.clearAllMocks();
      }
    });

    it('sends GraphQL requests with correct content type', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      } as Response);

      await tools.linear_create_issue.handler({ title: 'Test', teamId: 't' }, mockCredentials);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});

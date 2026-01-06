import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('GitHub Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'gho_test_token_123',
    token_type: 'Bearer',
    scope: 'repo user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('github_create_issue', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_create_issue;
      expect(tool.definition.name).toBe('github_create_issue');
      expect(tool.definition.description).toContain('Creates a new issue');
      expect(tool.definition.inputSchema.required).toEqual(['owner', 'repo', 'title']);
    });

    it('creates an issue successfully', async () => {
      const mockResponse = {
        id: 123,
        number: 1,
        title: 'Test Issue',
        state: 'open',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.github_create_issue.handler(
        {
          owner: 'test-owner',
          repo: 'test-repo',
          title: 'Test Issue',
          body: 'Test body',
          labels: ['bug'],
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer gho_test_token_123',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          }),
        })
      );
    });

    it('handles API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'Repository not found' }),
      } as Response);

      await expect(
        tools.github_create_issue.handler(
          {
            owner: 'test-owner',
            repo: 'nonexistent',
            title: 'Test',
          },
          mockCredentials
        )
      ).rejects.toThrow('GitHub API error: Repository not found');
    });

    it('works without optional parameters', async () => {
      const mockResponse = { id: 123, title: 'Test' };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.github_create_issue.handler(
        {
          owner: 'owner',
          repo: 'repo',
          title: 'Test',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('github_list_issues', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_list_issues;
      expect(tool.definition.name).toBe('github_list_issues');
      expect(tool.definition.description).toContain('Lists issues');
      expect(tool.definition.inputSchema.required).toEqual(['owner', 'repo']);
    });

    it('lists issues successfully', async () => {
      const mockIssues = [
        { id: 1, title: 'Issue 1', state: 'open' },
        { id: 2, title: 'Issue 2', state: 'closed' },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockIssues,
      } as Response);

      const result = await tools.github_list_issues.handler(
        {
          owner: 'test-owner',
          repo: 'test-repo',
          state: 'all',
        },
        mockCredentials
      );

      expect(result).toEqual(mockIssues);
    });

    it('filters issues by state', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      await tools.github_list_issues.handler(
        {
          owner: 'owner',
          repo: 'repo',
          state: 'open',
        },
        mockCredentials
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('state=open'),
        expect.any(Object)
      );
    });
  });

  describe('github_create_pull_request', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_create_pull_request;
      expect(tool.definition.name).toBe('github_create_pull_request');
      expect(tool.definition.description).toContain('Creates a new pull request');
      expect(tool.definition.inputSchema.required).toEqual([
        'owner',
        'repo',
        'title',
        'head',
        'base',
      ]);
    });

    it('creates a pull request successfully', async () => {
      const mockPR = {
        id: 456,
        number: 10,
        title: 'Test PR',
        state: 'open',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPR,
      } as Response);

      const result = await tools.github_create_pull_request.handler(
        {
          owner: 'test-owner',
          repo: 'test-repo',
          title: 'Test PR',
          head: 'feature-branch',
          base: 'main',
          body: 'PR description',
        },
        mockCredentials
      );

      expect(result).toEqual(mockPR);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/pulls',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('github_list_repos', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_list_repos;
      expect(tool.definition.name).toBe('github_list_repos');
      expect(tool.definition.description).toContain('List repositories');
    });

    it('lists repositories successfully', async () => {
      const mockRepos = [
        { id: 1, name: 'repo1', private: false },
        { id: 2, name: 'repo2', private: true },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRepos,
      } as Response);

      const result = await tools.github_list_repos.handler({}, mockCredentials);

      expect(result).toEqual(mockRepos);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/user/repos'),
        expect.any(Object)
      );
    });

    it('supports sorting options', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      await tools.github_list_repos.handler({ sort: 'updated' }, mockCredentials);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=updated'),
        expect.any(Object)
      );
    });
  });

  describe('github_get_file', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_get_file;
      expect(tool.definition.name).toBe('github_get_file');
      expect(tool.definition.description).toContain('Get the contents');
      expect(tool.definition.inputSchema.required).toEqual(['owner', 'repo', 'path']);
    });

    it('gets file content successfully', async () => {
      const mockFile = {
        name: 'README.md',
        path: 'README.md',
        content: btoa('# Test\nFile content'),
        encoding: 'base64',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFile,
      } as Response);

      const result = await tools.github_get_file.handler(
        {
          owner: 'test-owner',
          repo: 'test-repo',
          path: 'README.md',
        },
        mockCredentials
      );

      expect(result).toMatchObject({
        name: 'README.md',
        path: 'README.md',
        content: expect.any(String),
        encoding: 'base64',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/contents/README.md',
        expect.any(Object)
      );
    });

    it('supports specific branch/ref', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await tools.github_get_file.handler(
        {
          owner: 'owner',
          repo: 'repo',
          path: 'file.txt',
          ref: 'develop',
        },
        mockCredentials
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ref=develop'),
        expect.any(Object)
      );
    });
  });

  describe('github_create_file', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_create_file;
      expect(tool.definition.name).toBe('github_create_file');
      expect(tool.definition.description).toContain('Create or update a file');
      expect(tool.definition.inputSchema.required).toEqual([
        'owner',
        'repo',
        'path',
        'message',
        'content',
      ]);
    });

    it('creates a file successfully', async () => {
      const mockResponse = {
        content: { name: 'test.txt', path: 'test.txt' },
        commit: { sha: 'abc123' },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await tools.github_create_file.handler(
        {
          owner: 'test-owner',
          repo: 'test-repo',
          path: 'test.txt',
          content: 'Test content',
          message: 'Create test file',
        },
        mockCredentials
      );

      expect(result).toEqual(mockResponse);
    });

    it('includes SHA for file updates', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await tools.github_create_file.handler(
        {
          owner: 'owner',
          repo: 'repo',
          path: 'file.txt',
          content: 'Updated',
          message: 'Update file',
          sha: 'existing_sha',
        },
        mockCredentials
      );

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.sha).toBe('existing_sha');
    });
  });

  describe('github_search_code', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_search_code;
      expect(tool.definition.name).toBe('github_search_code');
      expect(tool.definition.description).toContain('Search for code');
      expect(tool.definition.inputSchema.required).toEqual(['query']);
    });

    it('searches code successfully', async () => {
      const mockResults = {
        total_count: 2,
        items: [
          { name: 'file1.js', path: 'src/file1.js' },
          { name: 'file2.js', path: 'src/file2.js' },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      } as Response);

      const result = await tools.github_search_code.handler(
        { query: 'function test' },
        mockCredentials
      );

      expect(result).toEqual(mockResults);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/search/code'),
        expect.any(Object)
      );
    });
  });

  describe('github_list_pull_requests', () => {
    it('has correct tool definition', () => {
      const tool = tools.github_list_pull_requests;
      expect(tool.definition.name).toBe('github_list_pull_requests');
      expect(tool.definition.description).toContain('List pull requests');
      expect(tool.definition.inputSchema.required).toEqual(['owner', 'repo']);
    });

    it('lists pull requests successfully', async () => {
      const mockPRs = [
        { id: 1, title: 'PR 1', state: 'open' },
        { id: 2, title: 'PR 2', state: 'closed' },
      ];

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPRs,
      } as Response);

      const result = await tools.github_list_pull_requests.handler(
        {
          owner: 'test-owner',
          repo: 'test-repo',
          state: 'all',
        },
        mockCredentials
      );

      expect(result).toEqual(mockPRs);
    });

    it('filters PRs by state', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      await tools.github_list_pull_requests.handler(
        {
          owner: 'owner',
          repo: 'repo',
          state: 'closed',
        },
        mockCredentials
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('state=closed'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        tools.github_create_issue.handler(
          { owner: 'test', repo: 'test', title: 'Test' },
          mockCredentials
        )
      ).rejects.toThrow('Network failure');
    });

    it('handles malformed JSON responses', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      await expect(
        tools.github_create_issue.handler(
          { owner: 'test', repo: 'test', title: 'Test' },
          mockCredentials
        )
      ).rejects.toThrow('GitHub API error: Bad Request');
    });
  });

  describe('Authentication', () => {
    it('includes OAuth token in all requests', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const testCases = [
        () =>
          tools.github_create_issue.handler({ owner: 'o', repo: 'r', title: 't' }, mockCredentials),
        () => tools.github_list_issues.handler({ owner: 'o', repo: 'r' }, mockCredentials),
        () => tools.github_list_repos.handler({}, mockCredentials),
      ];

      for (const testCase of testCases) {
        await testCase();
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer gho_test_token_123',
            }),
          })
        );
        vi.clearAllMocks();
      }
    });
  });
});

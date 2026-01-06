import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Notion Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'secret_notion_token_123',
    token_type: 'Bearer',
    scope: 'read write',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to verify Notion API headers
  const expectNotionHeaders = () => {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret_notion_token_123',
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        }),
      })
    );
  };

  describe('Page Operations', () => {
    describe('notion_create_page', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_create_page;
        expect(tool.definition.name).toBe('notion_create_page');
        expect(tool.definition.description).toContain('Creates a new page');
        expect(tool.definition.inputSchema.required).toEqual(['parent']);
      });

      it('creates a page successfully', async () => {
        const mockResponse = {
          object: 'page',
          id: 'page-123',
          created_time: '2025-01-01T00:00:00.000Z',
          properties: {},
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        } as Response);

        const result = await tools.notion_create_page.handler(
          {
            parent: { database_id: 'db-123' },
            properties: {
              Name: {
                title: [{ text: { content: 'Test Page' } }],
              },
            },
          },
          mockCredentials
        );

        expect(result).toEqual(mockResponse);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/pages',
          expect.objectContaining({
            method: 'POST',
          })
        );
        expectNotionHeaders();
      });

      it('creates page with all optional parameters', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'page', id: 'page-new' }),
        } as Response);

        await tools.notion_create_page.handler(
          {
            parent: { page_id: 'parent-page' },
            properties: {},
            children: [{ object: 'block', type: 'paragraph' }],
            icon: { type: 'emoji', emoji: '📝' },
            cover: { type: 'external', external: { url: 'https://example.com/cover.png' } },
          },
          mockCredentials
        );

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.parent.page_id).toBe('parent-page');
        expect(callBody.children).toBeDefined();
        expect(callBody.icon).toBeDefined();
        expect(callBody.cover).toBeDefined();
      });
    });

    describe('notion_get_page', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_get_page;
        expect(tool.definition.name).toBe('notion_get_page');
        expect(tool.definition.description).toContain('Retrieves a page');
        expect(tool.definition.inputSchema.required).toEqual(['page_id']);
      });

      it('retrieves a page successfully', async () => {
        const mockPage = { object: 'page', id: 'page-123', properties: {} };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockPage,
        } as Response);

        const result = await tools.notion_get_page.handler(
          { page_id: 'page-123' },
          mockCredentials
        );

        expect(result).toEqual(mockPage);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/pages/page-123',
          expect.any(Object)
        );
      });
    });

    describe('notion_update_page', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_update_page;
        expect(tool.definition.name).toBe('notion_update_page');
        expect(tool.definition.description).toContain('Updates');
        expect(tool.definition.inputSchema.required).toEqual(['page_id']);
      });

      it('updates a page successfully', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'page', id: 'page-123' }),
        } as Response);

        await tools.notion_update_page.handler(
          {
            page_id: 'page-123',
            properties: { Status: { select: { name: 'Done' } } },
          },
          mockCredentials
        );

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/pages/page-123',
          expect.objectContaining({
            method: 'PATCH',
          })
        );
      });

      it('updates page with icon and cover', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'page', id: 'page-123' }),
        } as Response);

        await tools.notion_update_page.handler(
          {
            page_id: 'page-123',
            properties: {},
            icon: { type: 'emoji', emoji: '✅' },
            cover: { type: 'external', external: { url: 'https://example.com/new.png' } },
          },
          mockCredentials
        );

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.icon).toBeDefined();
        expect(callBody.cover).toBeDefined();
      });
    });
  });

  describe('Database Operations', () => {
    describe('notion_query_database', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_query_database;
        expect(tool.definition.name).toBe('notion_query_database');
        expect(tool.definition.description).toContain('Queries a Notion database');
        expect(tool.definition.inputSchema.required).toEqual(['database_id']);
      });

      it('queries database successfully', async () => {
        const mockResults = {
          object: 'list',
          results: [
            { object: 'page', id: 'page-1' },
            { object: 'page', id: 'page-2' },
          ],
          has_more: false,
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResults,
        } as Response);

        const result = await tools.notion_query_database.handler(
          { database_id: 'db-123' },
          mockCredentials
        );

        expect(result).toEqual(mockResults);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/databases/db-123/query',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      it('queries with filters and sorts', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response);

        await tools.notion_query_database.handler(
          {
            database_id: 'db-123',
            filter: { property: 'Status', select: { equals: 'Done' } },
            sorts: [{ property: 'Created', direction: 'descending' }],
          },
          mockCredentials
        );

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.filter).toBeDefined();
        expect(callBody.sorts).toBeDefined();
      });

      it('queries with pagination', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [], has_more: false }),
        } as Response);

        await tools.notion_query_database.handler(
          {
            database_id: 'db-123',
            start_cursor: 'cursor-abc',
            page_size: 50,
          },
          mockCredentials
        );

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.start_cursor).toBe('cursor-abc');
        expect(callBody.page_size).toBe(50);
      });
    });

    describe('notion_get_database', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_get_database;
        expect(tool.definition.name).toBe('notion_get_database');
        expect(tool.definition.description).toContain('Retrieves database');
        expect(tool.definition.inputSchema.required).toEqual(['database_id']);
      });

      it('retrieves database successfully', async () => {
        const mockDb = { object: 'database', id: 'db-123', title: [] };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockDb,
        } as Response);

        const result = await tools.notion_get_database.handler(
          { database_id: 'db-123' },
          mockCredentials
        );

        expect(result).toEqual(mockDb);
      });
    });

    describe('notion_list_databases', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_list_databases;
        expect(tool.definition.name).toBe('notion_list_databases');
        expect(tool.definition.description).toContain('Lists all databases');
      });

      it('lists databases successfully', async () => {
        const mockResults = {
          object: 'list',
          results: [
            { object: 'database', id: 'db-1' },
            { object: 'database', id: 'db-2' },
          ],
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResults,
        } as Response);

        const result = await tools.notion_list_databases.handler({}, mockCredentials);

        expect(result).toEqual(mockResults);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/search',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });
  });

  describe('Block Operations', () => {
    describe('notion_append_block_children', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_append_block_children;
        expect(tool.definition.name).toBe('notion_append_block_children');
        expect(tool.definition.description).toContain('Appends new block children');
        expect(tool.definition.inputSchema.required).toEqual(['block_id', 'children']);
      });

      it('appends blocks successfully', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'list', results: [] }),
        } as Response);

        await tools.notion_append_block_children.handler(
          {
            block_id: 'block-123',
            children: [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ text: { content: 'New paragraph' } }] },
              },
            ],
          },
          mockCredentials
        );

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/blocks/block-123/children',
          expect.objectContaining({
            method: 'PATCH',
          })
        );
      });
    });

    describe('notion_get_block', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_get_block;
        expect(tool.definition.name).toBe('notion_get_block');
        expect(tool.definition.description).toContain('Retrieves a block');
        expect(tool.definition.inputSchema.required).toEqual(['block_id']);
      });

      it('retrieves block successfully', async () => {
        const mockBlock = { object: 'block', id: 'block-123', type: 'paragraph' };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlock,
        } as Response);

        const result = await tools.notion_get_block.handler(
          { block_id: 'block-123' },
          mockCredentials
        );

        expect(result).toEqual(mockBlock);
      });
    });

    describe('notion_get_block_children', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_get_block_children;
        expect(tool.definition.name).toBe('notion_get_block_children');
        expect(tool.definition.description).toContain('Retrieves children blocks');
        expect(tool.definition.inputSchema.required).toEqual(['block_id']);
      });

      it('retrieves block children successfully', async () => {
        const mockChildren = {
          object: 'list',
          results: [{ object: 'block', id: 'child-1', type: 'paragraph' }],
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockChildren,
        } as Response);

        const result = await tools.notion_get_block_children.handler(
          { block_id: 'block-123' },
          mockCredentials
        );

        expect(result).toEqual(mockChildren);
      });

      it('retrieves block children with pagination', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'list', results: [] }),
        } as Response);

        await tools.notion_get_block_children.handler(
          {
            block_id: 'block-123',
            start_cursor: 'cursor-xyz',
            page_size: 25,
          },
          mockCredentials
        );

        const callUrl = (global.fetch as any).mock.calls[0][0];
        expect(callUrl).toContain('start_cursor=cursor-xyz');
        expect(callUrl).toContain('page_size=25');
      });
    });

    describe('notion_update_block', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_update_block;
        expect(tool.definition.name).toBe('notion_update_block');
        expect(tool.definition.description).toContain('Updates a block');
        expect(tool.definition.inputSchema.required).toEqual(['block_id']);
      });

      it('updates block successfully', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'block', id: 'block-123' }),
        } as Response);

        await tools.notion_update_block.handler(
          {
            block_id: 'block-123',
            paragraph: { rich_text: [{ text: { content: 'Updated' } }] },
          },
          mockCredentials
        );

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/blocks/block-123',
          expect.objectContaining({
            method: 'PATCH',
          })
        );
      });
    });

    describe('notion_delete_block', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_delete_block;
        expect(tool.definition.name).toBe('notion_delete_block');
        expect(tool.definition.description).toContain('Deletes (archives)');
        expect(tool.definition.inputSchema.required).toEqual(['block_id']);
      });

      it('deletes block successfully', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'block', archived: true }),
        } as Response);

        await tools.notion_delete_block.handler({ block_id: 'block-123' }, mockCredentials);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/blocks/block-123',
          expect.objectContaining({
            method: 'PATCH',
          })
        );

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.archived).toBe(true);
      });
    });
  });

  describe('Search and User Operations', () => {
    describe('notion_search', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_search;
        expect(tool.definition.name).toBe('notion_search');
        expect(tool.definition.description).toContain('Searches');
      });

      it('searches successfully', async () => {
        const mockResults = {
          object: 'list',
          results: [{ object: 'page', id: 'page-1' }],
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResults,
        } as Response);

        const result = await tools.notion_search.handler({ query: 'test query' }, mockCredentials);

        expect(result).toEqual(mockResults);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/search',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      it('searches with filters', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response);

        await tools.notion_search.handler(
          {
            query: 'test',
            filter: { property: 'object', value: 'page' },
            sort: { direction: 'ascending', timestamp: 'last_edited_time' },
          },
          mockCredentials
        );

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.query).toBe('test');
        expect(callBody.filter).toBeDefined();
        expect(callBody.sort).toBeDefined();
      });
    });

    describe('notion_get_user', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_get_user;
        expect(tool.definition.name).toBe('notion_get_user');
        expect(tool.definition.description).toContain('Retrieves a user');
        expect(tool.definition.inputSchema.required).toEqual(['user_id']);
      });

      it('retrieves user successfully', async () => {
        const mockUser = {
          object: 'user',
          id: 'user-123',
          name: 'Test User',
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockUser,
        } as Response);

        const result = await tools.notion_get_user.handler(
          { user_id: 'user-123' },
          mockCredentials
        );

        expect(result).toEqual(mockUser);
      });
    });

    describe('notion_list_users', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_list_users;
        expect(tool.definition.name).toBe('notion_list_users');
        expect(tool.definition.description).toContain('Lists all users');
      });

      it('lists users successfully', async () => {
        const mockUsers = {
          object: 'list',
          results: [
            { object: 'user', id: 'user-1' },
            { object: 'user', id: 'user-2' },
          ],
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockUsers,
        } as Response);

        const result = await tools.notion_list_users.handler({}, mockCredentials);

        expect(result).toEqual(mockUsers);
      });

      it('lists users with pagination', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ object: 'list', results: [] }),
        } as Response);

        await tools.notion_list_users.handler(
          {
            start_cursor: 'cursor-123',
            page_size: 50,
          },
          mockCredentials
        );

        const callUrl = (global.fetch as any).mock.calls[0][0];
        expect(callUrl).toContain('start_cursor=cursor-123');
        expect(callUrl).toContain('page_size=50');
      });
    });

    describe('notion_get_bot_user', () => {
      it('has correct tool definition', () => {
        const tool = tools.notion_get_bot_user;
        expect(tool.definition.name).toBe('notion_get_bot_user');
        expect(tool.definition.description).toContain('Retrieves the bot user');
      });

      it('retrieves bot user successfully', async () => {
        const mockBot = {
          object: 'user',
          id: 'bot-123',
          type: 'bot',
        };

        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockBot,
        } as Response);

        const result = await tools.notion_get_bot_user.handler({}, mockCredentials);

        expect(result).toEqual(mockBot);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.notion.com/v1/users/me',
          expect.any(Object)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        tools.notion_get_page.handler({ page_id: 'page-123' }, mockCredentials)
      ).rejects.toThrow('Network failure');
    });

    it('handles Notion API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'Page not found' }),
      } as Response);

      await expect(
        tools.notion_get_page.handler({ page_id: 'invalid' }, mockCredentials)
      ).rejects.toThrow('Notion API error: Page not found');
    });

    it('handles malformed error responses', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      await expect(
        tools.notion_get_page.handler({ page_id: 'page-123' }, mockCredentials)
      ).rejects.toThrow('Notion API error: Bad Request');
    });
  });

  describe('Authentication', () => {
    it('includes OAuth token in all requests', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ object: 'page' }),
      } as Response);

      const testCases = [
        () => tools.notion_get_page.handler({ page_id: 'p-1' }, mockCredentials),
        () => tools.notion_get_database.handler({ database_id: 'd-1' }, mockCredentials),
        () => tools.notion_get_block.handler({ block_id: 'b-1' }, mockCredentials),
        () => tools.notion_list_users.handler({}, mockCredentials),
      ];

      for (const testCase of testCases) {
        await testCase();
        expectNotionHeaders();
        vi.clearAllMocks();
      }
    });

    it('includes Notion-Version header', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: 'page' }),
      } as Response);

      await tools.notion_get_page.handler({ page_id: 'page-123' }, mockCredentials);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Notion-Version': '2022-06-28',
          }),
        })
      );
    });
  });
});

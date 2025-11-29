# Notion Integration

OAuth 2.0 integration for Notion with comprehensive page, database, block, and user management capabilities.

## Features

- **Page Management**: Create, read, update, and archive pages
- **Database Querying**: Query databases with filters, sorting, and pagination
- **Block Operations**: Append, read, update, and delete content blocks
- **Search**: Search across all accessible pages and databases
- **User Management**: Retrieve user information and list workspace users
- **Rich Content**: Support for icons, covers, and complex property types

## OAuth Configuration

### Creating a Notion Integration

1. Go to [My Integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Fill in the required fields:
   - **Name**: Your integration name (e.g., "Authlane Integration")
   - **Associated workspace**: Select your workspace
   - **Logo**: Upload a logo (optional)
4. Under **Capabilities**, select:
   - ✅ Read content
   - ✅ Update content
   - ✅ Insert content
   - ✅ Read user information including email addresses (optional)
5. Under **Integration type**, select **Public**
6. Click **Submit**

### Configuring OAuth Settings

1. In your integration settings, scroll to **OAuth Domain & URIs**
2. Set **Redirect URIs**:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/notion/callback
   ```
   For production:
   ```
   https://your-domain.com/api/v1/users/{user_id}/connections/notion/callback
   ```
3. Save your changes
4. Copy the **OAuth client ID** and **OAuth client secret**

### Environment Variables

Set the following environment variables:

```bash
NOTION_CLIENT_ID=your_oauth_client_id
NOTION_CLIENT_SECRET=your_oauth_client_secret
```

## Available Tools

### Page Management Tools

#### `notion_create_page`
Creates a new page in a Notion database or as a child of another page.

```typescript
{
  parent: {
    database_id: "db_123456789",           // Use database_id OR page_id
    // page_id: "page_123456789"            // Alternative to database_id
  },
  properties: {                            // Required: page properties (schema varies)
    "Name": {                              // Example: title property
      "title": [{ "text": { "content": "New Page" } }]
    },
    "Status": {                            // Example: select property
      "select": { "name": "In Progress" }
    }
  },
  children: [                              // Optional: page content blocks
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [{ "text": { "content": "Page content here" } }]
      }
    }
  ],
  icon: {                                  // Optional: page icon
    "type": "emoji",
    "emoji": "📄"
  },
  cover: {                                 // Optional: cover image
    "type": "external",
    "external": { "url": "https://example.com/image.jpg" }
  }
}
```

#### `notion_get_page`
Retrieves a page from Notion by ID.

```typescript
{
  page_id: "page_123456789",               // Required: page ID
  filter_properties: ["title", "status"]   // Optional: specific properties to return
}
```

#### `notion_update_page`
Updates properties of an existing Notion page.

```typescript
{
  page_id: "page_123456789",               // Required: page ID
  properties: {                            // Properties to update
    "Status": {
      "select": { "name": "Done" }
    }
  },
  archived: false,                         // Optional: archive the page
  icon: {                                  // Optional: update icon
    "type": "emoji",
    "emoji": "✅"
  }
}
```

### Database Tools

#### `notion_query_database`
Queries a Notion database with optional filters and sorting.

```typescript
{
  database_id: "db_123456789",             // Required: database ID
  filter: {                                // Optional: filter conditions
    "and": [
      {
        "property": "Status",
        "select": { "equals": "In Progress" }
      },
      {
        "property": "Priority",
        "select": { "equals": "High" }
      }
    ]
  },
  sorts: [                                 // Optional: sort order
    {
      "property": "Created",
      "direction": "descending"
    }
  ],
  start_cursor: "cursor_123",              // Optional: pagination cursor
  page_size: 50,                           // Optional: results per page (default: 100, max: 100)
  filter_properties: ["title", "status"]   // Optional: specific properties to return
}
```

**Common filter operators**:
- **Text**: `equals`, `does_not_equal`, `contains`, `does_not_contain`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`
- **Number**: `equals`, `does_not_equal`, `greater_than`, `less_than`, `greater_than_or_equal_to`, `less_than_or_equal_to`
- **Checkbox**: `equals`, `does_not_equal`
- **Select**: `equals`, `does_not_equal`, `is_empty`, `is_not_empty`
- **Date**: `equals`, `before`, `after`, `on_or_before`, `on_or_after`, `past_week`, `past_month`, `past_year`, `next_week`, `next_month`, `next_year`

#### `notion_get_database`
Retrieves database information including schema.

```typescript
{
  database_id: "db_123456789"              // Required: database ID
}
```

#### `notion_list_databases`
Lists all databases that the integration has access to.

```typescript
{
  start_cursor: "cursor_123",              // Optional: pagination cursor
  page_size: 100                           // Optional: results per page (default: 100, max: 100)
}
```

### Search Tools

#### `notion_search`
Searches all pages and databases that the integration has access to.

```typescript
{
  query: "project planning",               // Optional: search text
  filter: {                                // Optional: filter by type
    "value": "page",                       // "page" or "database"
    "property": "object"
  },
  sort: {                                  // Optional: sort order
    "direction": "descending",
    "timestamp": "last_edited_time"
  },
  start_cursor: "cursor_123",              // Optional: pagination cursor
  page_size: 100                           // Optional: results per page (default: 100, max: 100)
}
```

### Block Management Tools

#### `notion_append_block_children`
Appends new block children to a page or block.

```typescript
{
  block_id: "block_123456789",             // Required: parent block/page ID
  children: [                              // Required: blocks to append
    {
      "object": "block",
      "type": "heading_2",
      "heading_2": {
        "rich_text": [{ "text": { "content": "Section Title" } }]
      }
    },
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [{ "text": { "content": "Paragraph text" } }]
      }
    }
  ],
  after: "block_987654321"                 // Optional: insert after this block
}
```

**Supported block types**:
- `paragraph`, `heading_1`, `heading_2`, `heading_3`
- `bulleted_list_item`, `numbered_list_item`, `to_do`
- `toggle`, `code`, `quote`, `callout`
- `divider`, `table_of_contents`
- `image`, `video`, `file`, `pdf`, `bookmark`
- `equation`, `embed`

#### `notion_get_block`
Retrieves a block by ID.

```typescript
{
  block_id: "block_123456789"              // Required: block ID
}
```

#### `notion_get_block_children`
Retrieves children blocks of a page or block.

```typescript
{
  block_id: "block_123456789",             // Required: parent block/page ID
  start_cursor: "cursor_123",              // Optional: pagination cursor
  page_size: 100                           // Optional: results per page (default: 100, max: 100)
}
```

#### `notion_update_block`
Updates a block by ID.

```typescript
{
  block_id: "block_123456789",             // Required: block ID
  archived: false,                         // Optional: archive the block
  content: {                               // Optional: updated content (varies by type)
    "paragraph": {
      "rich_text": [{ "text": { "content": "Updated text" } }]
    }
  }
}
```

#### `notion_delete_block`
Deletes (archives) a block by ID.

```typescript
{
  block_id: "block_123456789"              // Required: block ID
}
```

### User Management Tools

#### `notion_get_user`
Retrieves a user by ID.

```typescript
{
  user_id: "user_123456789"                // Required: user ID
}
```

#### `notion_list_users`
Lists all users in the workspace.

```typescript
{
  start_cursor: "cursor_123",              // Optional: pagination cursor
  page_size: 100                           // Optional: results per page (default: 100, max: 100)
}
```

#### `notion_get_bot_user`
Retrieves the bot user associated with the integration.

```typescript
{}  // No parameters required
```

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export NOTION_CLIENT_ID=your_oauth_client_id
export NOTION_CLIENT_SECRET=your_oauth_client_secret

./scripts/test-notion-oauth.sh
```

The test script will:
1. Verify API health
2. Check Notion service configuration
3. Initiate OAuth flow
4. Guide you through Notion authorization
5. Verify credentials storage and encryption
6. Test Notion API calls
7. Test search functionality

## Usage Examples

### Creating a Page in a Database

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/notion_create_page \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": { "database_id": "db_123456789" },
    "properties": {
      "Name": {
        "title": [{ "text": { "content": "New Project" } }]
      },
      "Status": {
        "select": { "name": "Planning" }
      }
    }
  }'
```

### Querying a Database

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/notion_query_database \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "database_id": "db_123456789",
    "filter": {
      "property": "Status",
      "select": { "equals": "In Progress" }
    },
    "sorts": [
      {
        "property": "Priority",
        "direction": "descending"
      }
    ]
  }'
```

### Updating a Page

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/notion_update_page \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "page_id": "page_123456789",
    "properties": {
      "Status": {
        "select": { "name": "Completed" }
      }
    },
    "icon": {
      "type": "emoji",
      "emoji": "✅"
    }
  }'
```

### Searching for Pages

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/notion_search \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "meeting notes",
    "filter": {
      "value": "page",
      "property": "object"
    }
  }'
```

### Adding Content to a Page

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/notion_append_block_children \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "block_id": "page_123456789",
    "children": [
      {
        "object": "block",
        "type": "heading_2",
        "heading_2": {
          "rich_text": [{ "text": { "content": "Meeting Notes" } }]
        }
      },
      {
        "object": "block",
        "type": "to_do",
        "to_do": {
          "rich_text": [{ "text": { "content": "Review proposal" } }],
          "checked": false
        }
      }
    ]
  }'
```

## Notion API Documentation

- [Notion API Reference](https://developers.notion.com/reference)
- [Notion API Guides](https://developers.notion.com/docs)
- [Working with Databases](https://developers.notion.com/docs/working-with-databases)
- [Working with Page Content](https://developers.notion.com/docs/working-with-page-content)
- [Property Values](https://developers.notion.com/reference/property-value-object)
- [Block Types](https://developers.notion.com/reference/block)

## Troubleshooting

### Integration Not Shared with Page/Database

Notion integrations must be explicitly shared with pages or databases:
1. Open the page or database in Notion
2. Click the **...** menu in the top right
3. Scroll to **Connections** → **Add connections**
4. Select your integration
5. Click **Confirm**

### Insufficient Permissions Error

If you get a "insufficient permissions" error:
1. Check that the integration has the required capabilities enabled
2. Verify the integration is shared with the page/database
3. Ensure you're not trying to access a page in a different workspace

### Invalid Request URL Error

This usually means:
1. The page/database ID is incorrect
2. The integration doesn't have access to the resource
3. The resource has been deleted or archived

### Rate Limiting

Notion API rate limits:
- **Average rate**: 3 requests per second per integration
- **Burst limit**: Higher for short periods
- Implement exponential backoff when rate limited

See [Notion API Rate Limits](https://developers.notion.com/reference/request-limits) for details.

### Object Not Found

If you get "object not found" errors:
1. Verify the ID is correct (page IDs vs block IDs)
2. Check that the page/database hasn't been deleted
3. Ensure the integration has access to the resource

## Property Types

Notion supports various property types in databases:

- **Title**: Main title of the page
- **Rich Text**: Formatted text
- **Number**: Numeric values
- **Select**: Single selection from options
- **Multi-select**: Multiple selections from options
- **Date**: Date or date range
- **People**: Workspace users
- **Files & media**: File attachments
- **Checkbox**: Boolean value
- **URL**: Web links
- **Email**: Email addresses
- **Phone**: Phone numbers
- **Formula**: Computed values
- **Relation**: Links to other database entries
- **Rollup**: Aggregate values from relations
- **Created time**: Auto-populated creation timestamp
- **Created by**: Auto-populated creator
- **Last edited time**: Auto-populated edit timestamp
- **Last edited by**: Auto-populated editor

Each property type has a specific schema. Refer to [Property Value Object](https://developers.notion.com/reference/property-value-object) for details.

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Only request access to pages/databases you need
- Regularly audit which pages your integration has access to
- Implement proper token refresh logic (Notion tokens don't expire but can be revoked)
- Monitor API usage for unusual activity
- Consider workspace-level vs public integrations based on your use case

## Best Practices

1. **Request minimal access**: Only connect to pages/databases you need
2. **Handle pagination**: Large databases require pagination
3. **Implement retry logic**: Handle rate limits and temporary failures
4. **Cache database schemas**: Database structures don't change frequently
5. **Use filters efficiently**: Filter on the server side when possible
6. **Batch operations**: Group related operations together
7. **Handle errors gracefully**: Provide user-friendly error messages
8. **Respect rate limits**: Implement exponential backoff
9. **Test with various property types**: Different databases have different schemas
10. **Keep block hierarchies shallow**: Deep nesting can impact performance

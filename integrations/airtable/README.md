# Airtable Integration

OAuth 2.0 integration for Airtable with comprehensive record management, schema access, and batch operations.

## Features

- **Record Management**: Create, read, update, and delete records
- **Batch Operations**: Process up to 10 records at once
- **Advanced Filtering**: Use Airtable formulas to filter records
- **Sorting & Pagination**: Sort results and paginate through large datasets
- **Schema Access**: List bases and retrieve table schemas
- **View Support**: Filter and sort using predefined views
- **Field Formatting**: Flexible cell format options (JSON or string)

## OAuth Configuration

### Creating an Airtable OAuth Integration

1. Go to [Airtable OAuth Integrations](https://airtable.com/create/oauth)
2. Click **Create new OAuth integration**
3. Fill in the required fields:
   - Integration name
   - Integration logo (optional)
   - Support link or email

### Configuring OAuth Redirect URIs

1. In your OAuth integration settings, add your redirect URI:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/airtable/callback
   ```
2. For production, add your production domain:
   ```
   https://your-domain.com/api/v1/users/{user_id}/connections/airtable/callback
   ```

### Required OAuth Scopes

**Minimum required scopes**:
- `data.records:read` - Read records from tables
- `data.records:write` - Create and update records
- `schema.bases:read` - Read base and table schemas

**Additional recommended scopes**:
- `data.recordComments:read` - Read record comments
- `data.recordComments:write` - Write record comments
- `schema.bases:write` - Modify base and table schemas

### Getting Client Credentials

1. After creating your OAuth integration, you'll receive:
   - **Client ID**: Used to identify your application
   - **Client Secret**: Keep this secure and never expose it client-side
2. Save both credentials securely

### Environment Variables

Set the following environment variables:

```bash
AIRTABLE_CLIENT_ID=your_client_id
AIRTABLE_CLIENT_SECRET=your_client_secret
```

## Available Tools

### Record Management Tools

#### `airtable_list_records`
Lists records from an Airtable table with optional filtering and sorting.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID (starts with "app")
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  fields: ["Name", "Email", "Status"],    // Optional: specific fields to return
  filter_by_formula: "{Status} = 'Active'", // Optional: filter formula
  max_records: 100,                       // Optional: max records (default: 100)
  page_size: 100,                         // Optional: page size (default: 100)
  sort: [                                 // Optional: sort configuration
    {
      field: "Created",
      direction: "desc"                   // "asc" or "desc"
    }
  ],
  view: "Grid view",                      // Optional: view name or ID
  cell_format: "json",                    // Optional: "json" or "string"
  time_zone: "America/New_York",          // Optional: timezone for dates
  user_locale: "en-us",                   // Optional: locale
  offset: "itrXXXXXXXXXXXXXX"             // Optional: pagination offset
}
```

#### `airtable_create_record`
Creates a new record in an Airtable table.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  fields: {                               // Required: field values
    "Name": "John Doe",
    "Email": "john@example.com",
    "Status": "Active",
    "Tags": ["Customer", "VIP"]
  },
  typecast: false                         // Optional: auto-convert types
}
```

#### `airtable_update_record`
Updates an existing record in an Airtable table.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  record_id: "recZZZZZZZZZZZZZZ",         // Required: record ID (starts with "rec")
  fields: {                               // Required: fields to update
    "Status": "Inactive",
    "Notes": "Updated via API"
  },
  typecast: false,                        // Optional: auto-convert types
  replace: false                          // Optional: replace all fields (default: merge)
}
```

#### `airtable_get_record`
Retrieves a single record by ID.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  record_id: "recZZZZZZZZZZZZZZ",         // Required: record ID
  cell_format: "json",                    // Optional: "json" or "string"
  time_zone: "America/New_York",          // Optional: timezone
  user_locale: "en-us"                    // Optional: locale
}
```

#### `airtable_delete_record`
Deletes a record from an Airtable table.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  record_id: "recZZZZZZZZZZZZZZ"          // Required: record ID to delete
}
```

### Batch Operations

#### `airtable_create_records_batch`
Creates multiple records at once (up to 10).

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  records: [                              // Required: array of records (max 10)
    {
      fields: {
        "Name": "Record 1",
        "Status": "Active"
      }
    },
    {
      fields: {
        "Name": "Record 2",
        "Status": "Pending"
      }
    }
  ],
  typecast: false                         // Optional: auto-convert types
}
```

#### `airtable_update_records_batch`
Updates multiple records at once (up to 10).

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  records: [                              // Required: array of records (max 10)
    {
      id: "recAAAAAAAAAAAAA",
      fields: { "Status": "Complete" }
    },
    {
      id: "recBBBBBBBBBBBBB",
      fields: { "Status": "In Progress" }
    }
  ],
  typecast: false,                        // Optional: auto-convert types
  replace: false                          // Optional: replace all fields
}
```

#### `airtable_delete_records_batch`
Deletes multiple records at once (up to 10).

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY",          // Required: table ID or name
  record_ids: [                           // Required: array of record IDs (max 10)
    "recAAAAAAAAAAAAA",
    "recBBBBBBBBBBBBB"
  ]
}
```

### Schema and Base Tools

#### `airtable_list_bases`
Lists all bases accessible by the user.

```typescript
{
  offset: "itrXXXXXXXXXXXXXX"             // Optional: pagination offset
}
```

#### `airtable_get_base_schema`
Retrieves the complete schema of a base including all tables and fields.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX"           // Required: base ID
}
```

#### `airtable_get_table_schema`
Retrieves the schema of a specific table.

```typescript
{
  base_id: "appXXXXXXXXXXXXXX",          // Required: base ID
  table_id: "tblYYYYYYYYYYYYYY"           // Required: table ID or name
}
```

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export AIRTABLE_CLIENT_ID=your_client_id
export AIRTABLE_CLIENT_SECRET=your_client_secret

./scripts/test-airtable-oauth.sh
```

The test script will:
1. Verify API health
2. Check Airtable service configuration
3. Initiate OAuth flow
4. Guide you through Airtable authorization
5. Verify credentials storage and encryption
6. Test Airtable API calls
7. Verify required scopes
8. Test listing bases

## Usage Examples

### Creating a New Record

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/airtable_create_record \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "appXXXXXXXXXXXXXX",
    "table_id": "Contacts",
    "fields": {
      "Name": "Jane Smith",
      "Email": "jane@example.com",
      "Company": "Acme Inc",
      "Status": "Active"
    }
  }'
```

### Listing Records with Filtering

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/airtable_list_records \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "appXXXXXXXXXXXXXX",
    "table_id": "Contacts",
    "filter_by_formula": "AND({Status} = '\''Active'\'', {Company} = '\''Acme Inc'\'')",
    "max_results": 50,
    "sort": [
      {
        "field": "Name",
        "direction": "asc"
      }
    ]
  }'
```

### Updating Multiple Records

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/airtable_update_records_batch \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "appXXXXXXXXXXXXXX",
    "table_id": "Tasks",
    "records": [
      {
        "id": "recAAAAAAAAAAAAA",
        "fields": { "Status": "Complete", "Completed Date": "2025-11-27" }
      },
      {
        "id": "recBBBBBBBBBBBBB",
        "fields": { "Status": "Complete", "Completed Date": "2025-11-27" }
      }
    ]
  }'
```

### Getting Base Schema

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/airtable_get_base_schema \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "appXXXXXXXXXXXXXX"
  }'
```

### Using Views and Complex Filters

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/airtable_list_records \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "appXXXXXXXXXXXXXX",
    "table_id": "Projects",
    "view": "Active Projects",
    "fields": ["Name", "Status", "Due Date", "Assignee"],
    "filter_by_formula": "IS_AFTER({Due Date}, TODAY())"
  }'
```

## Airtable Formula Reference

Common formulas for filtering:

- **Equality**: `{Status} = 'Active'`
- **Multiple conditions**: `AND({Status} = 'Active', {Priority} = 'High')`
- **OR conditions**: `OR({Type} = 'Bug', {Type} = 'Feature')`
- **Contains text**: `FIND('urgent', LOWER({Notes})) > 0`
- **Date comparisons**: `IS_AFTER({Due Date}, TODAY())`
- **Not empty**: `{Email} != BLANK()`
- **Number comparisons**: `{Score} >= 80`
- **In list**: `OR({Status} = 'Active', {Status} = 'Pending', {Status} = 'Review')`

See [Airtable Formula Reference](https://support.airtable.com/docs/formula-field-reference) for full documentation.

## Airtable API Documentation

- [Airtable API Reference](https://airtable.com/developers/web/api/introduction)
- [OAuth 2.0 Integration Guide](https://airtable.com/developers/web/api/oauth-reference)
- [Formula Field Reference](https://support.airtable.com/docs/formula-field-reference)
- [Field Types](https://airtable.com/developers/web/api/field-model)

## Troubleshooting

### Invalid Permissions Error

If you get an "invalid permissions" error:
1. Check that you've requested the correct scopes during OAuth
2. Verify your integration has access to the specific base
3. Ensure the user who authorized has the necessary permissions
4. Revoke and re-authorize the connection

### Record Not Found Error

This usually means:
1. The record ID is incorrect or doesn't exist
2. The record has been deleted
3. You don't have permission to access the record

### Base or Table Not Found

Common causes:
1. Incorrect base ID or table ID/name
2. The base has been deleted or access revoked
3. Table name is case-sensitive - ensure exact match

### Formula Syntax Error

When using `filter_by_formula`:
1. Field names must be wrapped in curly braces: `{Field Name}`
2. String values must be in single quotes: `'value'`
3. Use proper escaping in shell commands
4. Test formulas in Airtable UI first

### Rate Limit Exceeded

Airtable API has rate limits:
- **5 requests per second per base**
- Use batch operations when possible
- Implement exponential backoff for retries

### Typecast Issues

If you get type conversion errors:
1. Set `typecast: true` to let Airtable auto-convert
2. Ensure data matches expected field types
3. Check field configuration in Airtable

## Rate Limits

Airtable API rate limits:
- **5 requests per second per base**
- **1,000 records per request** for list operations
- **10 records per batch** for create/update/delete operations
- **100 KB payload size limit**

Best practices:
- Use batch operations to reduce API calls
- Implement request queuing for high-volume operations
- Cache base/table schemas to reduce metadata calls
- Monitor API usage to stay within limits

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Implement proper token refresh logic
- Regularly audit which bases your integration can access
- Consider implementing webhook verification for real-time updates
- Monitor API usage for unusual activity
- Rotate client secrets periodically

## Best Practices

1. **Use batch operations**: Process multiple records at once when possible
2. **Cache schemas**: Base and table schemas don't change frequently
3. **Filter server-side**: Use `filter_by_formula` instead of filtering in code
4. **Request only needed fields**: Use the `fields` parameter to reduce payload
5. **Handle pagination**: Large tables require pagination through results
6. **Implement retry logic**: Handle temporary API failures with exponential backoff
7. **Use views**: Leverage predefined views for complex filtering/sorting
8. **Validate data**: Check field types and constraints before creating/updating
9. **Monitor rate limits**: Stay within the 5 requests/second limit
10. **Use typecast wisely**: Only enable when you need auto-conversion

## Field Types and Values

Common Airtable field types and how to format values:

- **Single line text**: `"string value"`
- **Long text**: `"multi\nline\ntext"`
- **Email**: `"email@example.com"`
- **URL**: `"https://example.com"`
- **Number**: `42` or `3.14`
- **Currency**: `99.99`
- **Percent**: `0.75` (for 75%)
- **Date**: `"2025-11-27"` (ISO format)
- **Datetime**: `"2025-11-27T10:30:00.000Z"` (ISO 8601)
- **Checkbox**: `true` or `false`
- **Single select**: `"Option Name"`
- **Multiple select**: `["Option 1", "Option 2"]`
- **Linked records**: `["recXXXXXXXXXXXXXX"]` (array of record IDs)
- **Attachments**: See [Airtable Attachment docs](https://airtable.com/developers/web/api/field-model#multipleattachment)

## Webhook Support

Airtable supports webhooks for real-time updates. To use webhooks:

1. Create a webhook specification in your integration
2. Subscribe to specific table changes
3. Verify webhook signatures for security
4. Handle webhook payloads in your application

See [Airtable Webhooks](https://airtable.com/developers/web/api/webhooks-overview) for details.

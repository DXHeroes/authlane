# Pipedrive Integration

OAuth 2.0 integration for Pipedrive CRM with comprehensive deal, contact (person), and search capabilities.

## Features

- **Deal Management**: Create, read, update, and list deals
- **Contact (Person) Management**: Create, read, update, and list persons
- **Advanced Search**: Search across deals, persons, organizations, products, and files
- **Pagination Support**: Handle large datasets with offset-based pagination
- **Pipeline Management**: Work with custom pipelines and stages
- **Multi-field Contacts**: Support for multiple emails and phone numbers per contact
- **Visibility Control**: Manage object visibility (private vs. shared)

## OAuth Configuration

### Creating a Pipedrive App

1. Go to [Pipedrive Marketplace](https://www.pipedrive.com/en/marketplace)
2. Click **Developer Hub** → **Create an app**
3. Fill in basic app information:
   - App name
   - Description
   - Logo (optional)
   - Category

### Configuring OAuth Settings

1. In your app settings, navigate to **OAuth & access scopes** tab
2. Add your redirect URL:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/pipedrive/callback
   ```
   For production:
   ```
   https://yourdomain.com/api/v1/users/{user_id}/connections/pipedrive/callback
   ```

### Required OAuth Scopes

**Minimum required scopes**:
- `deals:read` - Read deals
- `deals:write` - Create and update deals
- `contacts:read` - Read contacts (deprecated, use persons)
- `contacts:write` - Create and update contacts (deprecated, use persons)
- `persons:read` - Read persons
- `persons:write` - Create and update persons

**Additional recommended scopes**:
- `organizations:read` - Read organizations
- `organizations:write` - Create and update organizations
- `activities:read` - Read activities
- `activities:write` - Create and update activities
- `pipelines:read` - Read pipelines and stages
- `users:read` - Read users for assignment
- `notes:read` - Read notes
- `notes:write` - Create and update notes
- `products:read` - Read products
- `products:write` - Create and update products

### Get Your Credentials

1. In your app settings, navigate to **OAuth & access scopes** tab
2. Copy your **Client ID** and **Client Secret**
3. Keep these secure and never expose them publicly

### Environment Variables

Set the following environment variables:

```bash
PIPEDRIVE_CLIENT_ID=your_client_id
PIPEDRIVE_CLIENT_SECRET=your_client_secret
```

## Important: Company-Specific API Domains

Pipedrive uses company-specific API domains. During OAuth, you'll receive an `api_domain` (e.g., `mycompany.pipedrive.com`). All API requests must use this domain: `https://{api_domain}/v1/`.

## Available Tools

### Deal Management Tools

#### `pipedrive_create_deal`
Create a new deal in Pipedrive CRM.

```typescript
{
  title: "Acme Corp - Enterprise License",      // Required: deal title
  value: 50000,                                 // Optional: deal value
  currency: "USD",                              // Optional: currency code (3-letter ISO)
  user_id: 123,                                 // Optional: owner user ID
  person_id: 456,                               // Optional: associated person ID
  org_id: 789,                                  // Optional: associated organization ID
  pipeline_id: 1,                               // Optional: pipeline ID
  stage_id: 2,                                  // Optional: stage ID in pipeline
  status: "open",                               // Optional: deal status
  expected_close_date: "2024-12-31",            // Optional: close date (YYYY-MM-DD)
  probability: 75,                              // Optional: success probability (0-100)
  lost_reason: "Budget constraints",            // Optional: reason for losing (when status is "lost")
  visible_to: "3",                              // Optional: visibility (1=Owner, 3=Company)
  add_time: "2024-01-15 10:30:00"               // Optional: creation time (UTC)
}
```

**Status options**:
- `open` - Active deal
- `won` - Won deal
- `lost` - Lost deal
- `deleted` - Deleted deal

**Visibility options**:
- `1` - Owner & followers (private)
- `3` - Entire company (shared, default)
- `5` - Entire company (shared & followers)
- `7` - Entire company (shared, visible to all)

#### `pipedrive_list_deals`
List deals from Pipedrive CRM with filtering and pagination.

```typescript
{
  start: 0,                                     // Pagination offset (default: 0)
  limit: 100,                                   // Max deals to return (default: 100, max: 500)
  user_id: 123,                                 // Optional: filter by owner user ID
  filter_id: 5,                                 // Optional: predefined filter ID
  stage_id: 2,                                  // Optional: filter by stage ID
  status: "open",                               // Optional: filter by status
  sort: "update_time",                          // Optional: sort field
  owned_by_you: false                           // Optional: filter by authorized user
}
```

**Status filter options**:
- `open` - Open deals only
- `won` - Won deals only
- `lost` - Lost deals only
- `deleted` - Deleted deals only
- `all_not_deleted` - All except deleted (default)

#### `pipedrive_get_deal`
Retrieve a specific deal by ID.

```typescript
{
  deal_id: 12345                                // Required: deal ID
}
```

#### `pipedrive_update_deal`
Update an existing deal.

```typescript
{
  deal_id: 12345,                               // Required: deal ID
  title: "Updated Deal Name",                   // Optional: new title
  value: 60000,                                 // Optional: new value
  stage_id: 3,                                  // Optional: move to new stage
  status: "won",                                // Optional: update status
  probability: 100                              // Optional: update probability
}
```

### Contact (Person) Management Tools

#### `pipedrive_add_contact`
Create a new person (contact) in Pipedrive CRM.

```typescript
{
  name: "John Doe",                             // Required: person name
  owner_id: 123,                                // Optional: owner user ID
  org_id: 456,                                  // Optional: associated organization ID
  email: [                                      // Optional: email addresses
    {
      value: "john@example.com",
      primary: true,
      label: "work"
    },
    {
      value: "john.personal@gmail.com",
      primary: false,
      label: "home"
    }
  ],
  phone: [                                      // Optional: phone numbers
    {
      value: "+1234567890",
      primary: true,
      label: "mobile"
    },
    {
      value: "+1987654321",
      primary: false,
      label: "work"
    }
  ],
  visible_to: "3",                              // Optional: visibility (1=Owner, 3=Company)
  add_time: "2024-01-15 10:30:00"               // Optional: creation time (UTC)
}
```

**Email/Phone labels**:
- `work` - Work contact
- `home` - Home contact
- `mobile` - Mobile phone
- `other` - Other

#### `pipedrive_list_contacts`
List persons from Pipedrive CRM with filtering and pagination.

```typescript
{
  start: 0,                                     // Pagination offset (default: 0)
  limit: 100,                                   // Max persons to return (default: 100, max: 500)
  user_id: 123,                                 // Optional: filter by owner user ID
  filter_id: 5,                                 // Optional: predefined filter ID
  first_char: "A",                              // Optional: filter by first character of name
  sort: "name"                                  // Optional: sort field
}
```

#### `pipedrive_get_contact`
Retrieve a specific person by ID.

```typescript
{
  person_id: 12345                              // Required: person ID
}
```

#### `pipedrive_update_contact`
Update an existing person.

```typescript
{
  person_id: 12345,                             // Required: person ID
  name: "Jane Doe",                             // Optional: updated name
  email: [                                      // Optional: updated emails
    {
      value: "jane@example.com",
      primary: true,
      label: "work"
    }
  ],
  org_id: 789                                   // Optional: new organization
}
```

### Search Tools

#### `pipedrive_search`
Search across deals, persons, organizations, products, and files.

```typescript
{
  term: "acme",                                 // Required: search term (min 2 chars)
  item_types: ["deal", "person", "organization"], // Optional: types to search
  fields: "custom_fields",                      // Optional: search in custom fields or notes
  exact_match: false,                           // Optional: exact match only
  start: 0,                                     // Optional: pagination offset
  limit: 100                                    // Optional: max results (default: 100, max: 500)
}
```

**Item types**:
- `deal` - Deals
- `person` - Persons (contacts)
- `organization` - Organizations
- `product` - Products
- `file` - Files

**Search fields**:
- `custom_fields` - Include custom fields in search
- `notes` - Include notes in search

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export PIPEDRIVE_CLIENT_ID=your_client_id
export PIPEDRIVE_CLIENT_SECRET=your_client_secret

./scripts/test-pipedrive-oauth.sh
```

The test script will:
1. Verify API health
2. Check Pipedrive service configuration
3. Initiate OAuth flow
4. Guide you through Pipedrive authorization
5. Verify credentials storage and encryption
6. Test Pipedrive API calls
7. Verify required scopes
8. Test listing deals

## Usage Examples

### Creating a Contact with Multiple Emails

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/pipedrive_add_contact \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": [
      {
        "value": "john@acme.com",
        "primary": true,
        "label": "work"
      },
      {
        "value": "john.personal@gmail.com",
        "primary": false,
        "label": "home"
      }
    ],
    "phone": [
      {
        "value": "+1234567890",
        "primary": true,
        "label": "mobile"
      }
    ]
  }'
```

### Creating a Deal with Contact Association

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/pipedrive_create_deal \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Acme Corp - Enterprise License",
    "value": 100000,
    "currency": "USD",
    "person_id": 456,
    "status": "open",
    "expected_close_date": "2024-12-31",
    "probability": 80
  }'
```

### Listing Open Deals

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/pipedrive_list_deals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20,
    "status": "open",
    "sort": "value"
  }'
```

### Searching for a Company

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/pipedrive_search \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "term": "acme",
    "item_types": ["organization", "person", "deal"],
    "limit": 10
  }'
```

### Updating a Deal to Won

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/pipedrive_update_deal \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deal_id": 12345,
    "status": "won",
    "probability": 100
  }'
```

### Listing Contacts by First Letter

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/pipedrive_list_contacts \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 50,
    "first_char": "A",
    "sort": "name"
  }'
```

## Pipedrive API Documentation

- [Pipedrive API Reference](https://developers.pipedrive.com/docs/api/v1)
- [Deals API](https://developers.pipedrive.com/docs/api/v1/Deals)
- [Persons API](https://developers.pipedrive.com/docs/api/v1/Persons)
- [Organizations API](https://developers.pipedrive.com/docs/api/v1/Organizations)
- [Search API](https://developers.pipedrive.com/docs/api/v1/ItemSearch)
- [OAuth 2.0](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)
- [Scopes Reference](https://pipedrive.readme.io/docs/marketplace-oauth-scopes)

## Troubleshooting

### Invalid Client Error

If you get an "invalid client" error during OAuth:
1. Ensure your app is created in [Pipedrive Developer Hub](https://developers.pipedrive.com/)
2. Verify the Client ID matches your app
3. Check that your redirect URI is added to the app settings
4. Ensure the app is published or in development mode

### Insufficient Permissions Error

If you get an "insufficient permissions" error:
1. Check that you've requested the correct scopes in your app settings
2. Navigate to **OAuth & access scopes** tab and verify scopes are enabled
3. Revoke and re-authorize the connection in Authlane
4. Ensure the Pipedrive account has permissions to access the requested resources

### Invalid Grant Error

This usually means the authorization code has expired or been used:
1. Authorization codes are single-use only
2. They expire after a few minutes
3. Start a new authorization flow

### API Domain Not Found

If API calls fail with domain errors:
1. Ensure the `api_domain` was captured during OAuth
2. Check that the API domain is stored in credentials
3. Verify the domain format is correct (e.g., `mycompany.pipedrive.com`)
4. Re-authorize the connection to capture the correct API domain

### Invalid Pipeline or Stage Error

If you get an "invalid pipeline or stage" error:
1. Pipeline and stage IDs are specific to each Pipedrive account
2. Get valid IDs from Pipedrive Settings → Pipelines
3. Or use the Pipelines API to retrieve valid pipelines and stages
4. Default pipeline is used if not specified

## Rate Limits

Pipedrive API rate limits:
- **Standard rate limit**: 100 requests per 2 seconds per company
- **Burst limit**: 10,000 requests per hour per company
- Rate limits are per company, not per user

Monitor your API usage in the Pipedrive Developer Hub.

**Best practices**:
- Implement exponential backoff for 429 errors
- Use batch operations when available
- Cache frequently accessed data (pipelines, stages, users)
- Respect the rate limit headers in responses
- Consider using webhooks for real-time updates instead of polling

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Regularly review connected apps in Pipedrive account settings
- Implement proper token refresh logic to maintain access
- Monitor API usage for unusual activity
- Enable two-factor authentication on your Pipedrive account
- Store the `api_domain` securely as it's required for all API calls

## Best Practices

1. **Use minimal scopes**: Only request scopes you need
2. **Handle pagination**: Use offset-based pagination for large datasets
3. **Implement retry logic**: Handle temporary API failures with exponential backoff
4. **Cache pipeline data**: Pipeline and stage definitions don't change often
5. **Use search effectively**: The search API is powerful for finding records
6. **Filter server-side**: Use Pipedrive's filter API instead of filtering locally
7. **Handle errors gracefully**: Provide user-friendly error messages
8. **Validate data**: Check required fields before making API calls
9. **Use associations**: Link persons, deals, and organizations for better data relationships
10. **Monitor rate limits**: Track API usage and implement rate limiting
11. **Store API domain**: Always use the company-specific API domain from OAuth
12. **Use visibility settings**: Control who can see objects with visibility parameters

## Common Use Cases

### Lead Qualification Flow
1. Create person with `pipedrive_add_contact`
2. Create associated deal with `pipedrive_create_deal`
3. Set appropriate pipeline and stage
4. Update deal probability as it progresses
5. Mark as won/lost when complete

### Contact Enrichment
1. Search for existing person with `pipedrive_search`
2. Fetch person details with `pipedrive_get_contact`
3. Enrich with external data
4. Update person with `pipedrive_update_contact`
5. Add additional emails/phones as needed

### Deal Pipeline Management
1. List deals in specific stage with `pipedrive_list_deals`
2. Filter by status, owner, or custom criteria
3. Update deal stages as they progress
4. Track deal velocity and conversion rates
5. Analyze won/lost deals for insights

### Multi-Channel Contact Management
1. Create person with multiple emails and phones
2. Mark primary contact method
3. Label contacts by type (work, home, mobile)
4. Update contact preferences over time
5. Track communication history

### Deal Reporting
1. List deals with filters for specific criteria
2. Sort by value, probability, or expected close date
3. Export to analytics platform
4. Calculate pipeline value and forecasts
5. Identify bottlenecks in sales process

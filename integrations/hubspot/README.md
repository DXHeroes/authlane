# HubSpot Integration

OAuth 2.0 integration for HubSpot CRM with comprehensive contact and deal management capabilities.

## Features

- **Contact Management**: Create, read, update, and list contacts
- **Deal Management**: Create, read, update, and list deals
- **Advanced Filtering**: Filter contacts and deals using HubSpot's filter API
- **Pagination Support**: Handle large datasets with cursor-based pagination
- **Custom Properties**: Support for custom contact and deal properties
- **Associations**: Link deals with contacts, companies, and other CRM objects

## OAuth Configuration

### Creating a HubSpot App

1. Go to [HubSpot App Marketplace](https://app.hubspot.com/ecosystem/marketplace/apps)
2. Click your profile → **Apps** → **Create app**
3. Fill in basic app information:
   - App name
   - Description
   - Logo (optional)

### Configuring OAuth Settings

1. In your app settings, navigate to **Auth** tab
2. Add your redirect URL:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/hubspot/callback
   ```
   For production:
   ```
   https://yourdomain.com/api/v1/users/{user_id}/connections/hubspot/callback
   ```

### Required OAuth Scopes

**Minimum required scopes**:
- `crm.objects.contacts.read` - Read contacts
- `crm.objects.contacts.write` - Create and update contacts
- `crm.objects.deals.read` - Read deals
- `crm.objects.deals.write` - Create and update deals

**Additional recommended scopes**:
- `crm.objects.companies.read` - Read companies
- `crm.objects.companies.write` - Create and update companies
- `crm.schemas.contacts.read` - Read contact property definitions
- `crm.schemas.deals.read` - Read deal property definitions
- `crm.objects.owners.read` - Read owners for assignment

### Get Your Credentials

1. In your app settings, navigate to **Auth** tab
2. Copy your **Client ID** and **Client Secret**
3. Keep these secure and never expose them publicly

### Environment Variables

Set the following environment variables:

```bash
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
```

## Available Tools

### Contact Management Tools

#### `hubspot_create_contact`
Create a new contact in HubSpot CRM.

```typescript
{
  email: "contact@example.com",              // Required: email address
  firstname: "John",                         // Optional: first name
  lastname: "Doe",                           // Optional: last name
  phone: "+1234567890",                      // Optional: phone number
  company: "Acme Corp",                      // Optional: company name
  website: "https://example.com",            // Optional: website URL
  jobtitle: "CEO",                           // Optional: job title
  lifecyclestage: "customer",                // Optional: lifecycle stage
  hs_lead_status: "NEW",                     // Optional: lead status
  city: "San Francisco",                     // Optional: city
  state: "CA",                               // Optional: state/region
  country: "USA",                            // Optional: country
  zip: "94102",                              // Optional: postal code
  customProperties: {                        // Optional: custom properties
    custom_field_1: "value1",
    custom_field_2: "value2"
  }
}
```

**Lifecycle stages**:
- `subscriber` - Newsletter subscriber
- `lead` - New lead
- `marketingqualifiedlead` - MQL
- `salesqualifiedlead` - SQL
- `opportunity` - Active opportunity
- `customer` - Paying customer
- `evangelist` - Brand advocate
- `other` - Other

#### `hubspot_list_contacts`
List contacts from HubSpot CRM with filtering and pagination.

```typescript
{
  limit: 10,                                 // Max contacts to return (default: 10, max: 100)
  after: "cursor_token",                     // Pagination cursor
  properties: ["firstname", "lastname", "email"], // Properties to include
  archived: false,                           // Include archived contacts
  filterGroups: [                            // Optional: filter contacts
    {
      filters: [
        {
          propertyName: "lifecyclestage",
          operator: "EQ",
          value: "customer"
        }
      ]
    }
  ],
  sorts: [                                   // Optional: sort results
    {
      propertyName: "createdate",
      direction: "DESCENDING"
    }
  ]
}
```

**Filter operators**:
- `EQ` - Equal to
- `NEQ` - Not equal to
- `LT` - Less than
- `LTE` - Less than or equal to
- `GT` - Greater than
- `GTE` - Greater than or equal to
- `CONTAINS` - Contains text
- `NOT_CONTAINS` - Does not contain text
- `IN` - In list of values
- `NOT_IN` - Not in list of values
- `HAS_PROPERTY` - Has property value
- `NOT_HAS_PROPERTY` - Property is empty

#### `hubspot_get_contact`
Retrieve a specific contact by ID.

```typescript
{
  contactId: "12345",                        // Required: contact ID
  properties: ["firstname", "lastname", "email"], // Optional: properties to include
  archived: false                            // Optional: include archived
}
```

#### `hubspot_update_contact`
Update an existing contact.

```typescript
{
  contactId: "12345",                        // Required: contact ID
  properties: {                              // Required: properties to update
    firstname: "Jane",
    lastname: "Smith",
    lifecyclestage: "customer"
  }
}
```

### Deal Management Tools

#### `hubspot_create_deal`
Create a new deal in HubSpot CRM.

```typescript
{
  dealname: "Acme Corp - Q1 Deal",           // Required: deal name
  amount: 50000,                             // Optional: deal amount
  dealstage: "presentationscheduled",        // Optional: deal stage ID
  pipeline: "default",                       // Optional: pipeline ID
  closedate: "2024-12-31",                   // Optional: close date (ISO 8601 or timestamp)
  dealtype: "newbusiness",                   // Optional: deal type
  hubspot_owner_id: "12345",                 // Optional: owner ID
  description: "Q1 enterprise deal",         // Optional: description
  hs_priority: "high",                       // Optional: priority
  hs_forecast_probability: 75,               // Optional: forecast probability (0-100)
  associations: [                            // Optional: associate with contacts/companies
    {
      to: { id: "contact_123" },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: 3               // 3 = deal to contact
        }
      ]
    }
  ],
  customProperties: {                        // Optional: custom properties
    custom_deal_field: "value"
  }
}
```

**Deal types**:
- `newbusiness` - New business
- `existingbusiness` - Existing business
- `renewalbusiness` - Renewal business

**Priority levels**:
- `low` - Low priority
- `medium` - Medium priority
- `high` - High priority

**Common association type IDs**:
- `3` - Deal to Contact
- `5` - Deal to Company
- `28` - Contact to Company

#### `hubspot_list_deals`
List deals from HubSpot CRM with filtering and pagination.

```typescript
{
  limit: 10,                                 // Max deals to return (default: 10, max: 100)
  after: "cursor_token",                     // Pagination cursor
  properties: ["dealname", "amount", "dealstage"], // Properties to include
  archived: false,                           // Include archived deals
  filterGroups: [                            // Optional: filter deals
    {
      filters: [
        {
          propertyName: "dealstage",
          operator: "EQ",
          value: "closedwon"
        }
      ]
    }
  ],
  sorts: [                                   // Optional: sort results
    {
      propertyName: "amount",
      direction: "DESCENDING"
    }
  ]
}
```

#### `hubspot_get_deal`
Retrieve a specific deal by ID.

```typescript
{
  dealId: "12345",                           // Required: deal ID
  properties: ["dealname", "amount", "dealstage"], // Optional: properties to include
  archived: false                            // Optional: include archived
}
```

#### `hubspot_update_deal`
Update an existing deal.

```typescript
{
  dealId: "12345",                           // Required: deal ID
  properties: {                              // Required: properties to update
    dealstage: "closedwon",
    amount: 60000,
    hs_priority: "high"
  }
}
```

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export HUBSPOT_CLIENT_ID=your_client_id
export HUBSPOT_CLIENT_SECRET=your_client_secret

./scripts/test-hubspot-oauth.sh
```

The test script will:
1. Verify API health
2. Check HubSpot service configuration
3. Initiate OAuth flow
4. Guide you through HubSpot authorization
5. Verify credentials storage and encryption
6. Test HubSpot API calls
7. Verify required scopes
8. Test listing contacts

## Usage Examples

### Creating a Contact

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/hubspot_create_contact \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "firstname": "John",
    "lastname": "Doe",
    "company": "Acme Corp",
    "phone": "+1234567890",
    "lifecyclestage": "lead"
  }'
```

### Listing Contacts with Filtering

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/hubspot_list_contacts \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20,
    "properties": ["firstname", "lastname", "email", "lifecyclestage"],
    "filterGroups": [
      {
        "filters": [
          {
            "propertyName": "lifecyclestage",
            "operator": "EQ",
            "value": "customer"
          }
        ]
      }
    ],
    "sorts": [
      {
        "propertyName": "createdate",
        "direction": "DESCENDING"
      }
    ]
  }'
```

### Creating a Deal with Contact Association

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/hubspot_create_deal \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dealname": "Acme Corp - Enterprise Plan",
    "amount": 100000,
    "dealstage": "qualifiedtobuy",
    "closedate": "2024-12-31",
    "dealtype": "newbusiness",
    "hs_priority": "high",
    "associations": [
      {
        "to": { "id": "12345" },
        "types": [
          {
            "associationCategory": "HUBSPOT_DEFINED",
            "associationTypeId": 3
          }
        ]
      }
    ]
  }'
```

### Listing Recent High-Value Deals

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/hubspot_list_deals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "properties": ["dealname", "amount", "dealstage", "closedate"],
    "filterGroups": [
      {
        "filters": [
          {
            "propertyName": "amount",
            "operator": "GTE",
            "value": "50000"
          }
        ]
      }
    ],
    "sorts": [
      {
        "propertyName": "createdate",
        "direction": "DESCENDING"
      }
    ]
  }'
```

### Updating a Contact

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/hubspot_update_contact \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contactId": "12345",
    "properties": {
      "lifecyclestage": "customer",
      "hs_lead_status": "CLOSED_WON"
    }
  }'
```

## HubSpot API Documentation

- [HubSpot API Reference](https://developers.hubspot.com/docs/api/overview)
- [CRM Objects API](https://developers.hubspot.com/docs/api/crm/understanding-the-crm)
- [Contacts API](https://developers.hubspot.com/docs/api/crm/contacts)
- [Deals API](https://developers.hubspot.com/docs/api/crm/deals)
- [OAuth 2.0](https://developers.hubspot.com/docs/api/oauth)
- [Scopes Reference](https://developers.hubspot.com/docs/api/oauth-scopes)

## Troubleshooting

### App Not Found Error

If you get an "app not found" error during OAuth:
1. Ensure your app is created in [HubSpot Developer Portal](https://app.hubspot.com/ecosystem/marketplace/apps)
2. Verify the Client ID matches your app
3. Check that your redirect URI is added to the app settings

### Insufficient Permissions Error

If you get a "insufficient permissions" error:
1. Check that you've requested the correct scopes in your app settings
2. Navigate to **Auth** tab and verify scopes are enabled
3. Revoke and re-authorize the connection in Authlane
4. Ensure the HubSpot account has permissions to access the requested resources

### Invalid Grant Error

This usually means the authorization code has expired or been used:
1. Authorization codes are single-use only
2. They expire after a few minutes
3. Start a new authorization flow

### Property Does Not Exist Error

If you get a "property does not exist" error:
1. Check the property name is correct (case-sensitive)
2. Verify the property exists in your HubSpot account
3. For custom properties, ensure they're created in HubSpot settings
4. Use the Properties API to list available properties

### Invalid Deal Stage Error

If you get an "invalid deal stage" error:
1. Deal stage IDs are specific to each pipeline
2. Get valid stage IDs from HubSpot Settings → Objects → Deals → Pipelines
3. Or use the Pipelines API to retrieve valid stages

## Rate Limits

HubSpot API rate limits:
- **Free/Starter**: 100 requests per 10 seconds
- **Professional/Enterprise**: 150 requests per 10 seconds
- **API limit tier 1**: 100 requests per 10 seconds per user
- **API limit tier 2**: 150 requests per 10 seconds (purchased)

Monitor your API usage in the [HubSpot Developer Portal](https://app.hubspot.com/).

**Best practices**:
- Implement exponential backoff for 429 errors
- Use batch operations when available
- Cache frequently accessed data (properties, pipelines)
- Respect the `X-HubSpot-RateLimit-*` headers

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Regularly review connected apps in HubSpot account settings
- Implement proper token refresh logic to maintain access
- Monitor API usage for unusual activity
- Consider IP whitelisting for production apps
- Enable two-factor authentication on your HubSpot account

## Best Practices

1. **Use minimal scopes**: Only request scopes you need
2. **Handle pagination**: Use cursor-based pagination for large datasets
3. **Implement retry logic**: Handle temporary API failures with exponential backoff
4. **Cache property definitions**: Property schemas don't change often
5. **Use batch operations**: Combine multiple operations when possible
6. **Filter server-side**: Use HubSpot's filter API instead of filtering locally
7. **Handle errors gracefully**: Provide user-friendly error messages
8. **Validate data**: Check required fields before making API calls
9. **Use associations**: Link contacts, deals, and companies for better data relationships
10. **Monitor rate limits**: Track API usage and implement rate limiting

## Common Use Cases

### Lead Qualification Flow
1. Create contact with `hubspot_create_contact`
2. Set lifecycle stage to "lead"
3. Create associated deal with `hubspot_create_deal`
4. Update contact to "salesqualifiedlead" when qualified
5. Move deal through pipeline stages

### Customer Onboarding
1. Update contact lifecycle to "customer"
2. Create onboarding deal
3. Associate deal with contact and company
4. Track onboarding progress through deal stages

### Contact Enrichment
1. Fetch contact with `hubspot_get_contact`
2. Enrich with external data
3. Update contact with `hubspot_update_contact`
4. Add custom properties for enriched fields

### Deal Reporting
1. List deals with filters for specific criteria
2. Sort by amount or close date
3. Export to analytics platform
4. Track deal velocity and win rates

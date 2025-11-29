# Stripe Integration

OAuth 2.0 integration for Stripe with read-only access to payment data, customers, invoices, and subscriptions.

## Features

- **Customer Management**: List and retrieve customer information
- **Payment Retrieval**: Access payment intents and charges
- **Invoice Management**: List and retrieve invoices with filtering
- **Subscription Access**: View subscription details and status
- **Balance Information**: Check account balance and transaction history
- **Read-Only Access**: Secure read-only permissions for payment data

## OAuth Configuration

### Creating a Stripe Connect Application

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Settings** → **Connect**
3. Click **Get started** under Connect platform settings
4. Configure your Connect platform settings

### Configuring OAuth Settings

1. In **Settings** → **Connect** → **OAuth settings**
2. Add your redirect URI:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/stripe/callback
   ```
3. For production, add your production redirect URI:
   ```
   https://yourdomain.com/api/v1/users/{user_id}/connections/stripe/callback
   ```

### Required OAuth Scopes

**Default scope**:
- `read_only` - Read-only access to all Stripe resources

This integration uses the `read_only` scope which grants safe, read-only access to:
- Customers
- Payments and Payment Intents
- Charges
- Invoices
- Subscriptions
- Balance and Balance Transactions
- Account information

**Note**: This integration intentionally uses read-only permissions to ensure secure access to sensitive payment data without modification capabilities.

### Get Your OAuth Credentials

1. Go to **Settings** → **Connect** → **OAuth settings**
2. Find your **Client ID** (starts with `ca_`)
3. Click **+ Add client secret** to generate a new secret
4. Save your Client ID and Client Secret securely

### Environment Variables

Set the following environment variables:

```bash
STRIPE_CLIENT_ID=ca_your_client_id
STRIPE_CLIENT_SECRET=sk_your_secret_key
```

## Available Tools

All tools are **read-only** and do not modify any data in your Stripe account.

### Customer Tools

#### `stripe_list_customers`
List customers in your Stripe account.

```typescript
{
  limit: 10,                               // Max customers (default: 10, max: 100)
  starting_after: "cus_123",               // Pagination cursor
  ending_before: "cus_456",                // Pagination cursor
  email: "customer@example.com",           // Filter by email
  created: {                               // Filter by creation date
    gt: 1609459200,                        // Unix timestamp
    gte: 1609459200,
    lt: 1640995200,
    lte: 1640995200
  }
}
```

#### `stripe_get_customer`
Retrieve details of a specific customer.

```typescript
{
  customer_id: "cus_123456789"             // Required: customer ID
}
```

### Payment Tools

#### `stripe_get_payment`
Retrieve details of a specific payment intent.

```typescript
{
  payment_intent_id: "pi_123456789"        // Required: payment intent ID
}
```

#### `stripe_list_payments`
List payment intents with filtering.

```typescript
{
  limit: 10,                               // Max payments (default: 10, max: 100)
  starting_after: "pi_123",                // Pagination cursor
  ending_before: "pi_456",                 // Pagination cursor
  customer: "cus_123",                     // Filter by customer
  created: {                               // Filter by creation date
    gt: 1609459200,
    gte: 1609459200
  }
}
```

#### `stripe_list_charges`
List charges with filtering.

```typescript
{
  limit: 10,                               // Max charges (default: 10, max: 100)
  starting_after: "ch_123",                // Pagination cursor
  ending_before: "ch_456",                 // Pagination cursor
  customer: "cus_123",                     // Filter by customer
  payment_intent: "pi_123",                // Filter by payment intent
  created: {                               // Filter by creation date
    gt: 1609459200
  }
}
```

#### `stripe_get_charge`
Retrieve details of a specific charge.

```typescript
{
  charge_id: "ch_123456789"                // Required: charge ID
}
```

### Invoice Tools

#### `stripe_list_invoices`
List invoices with filtering.

```typescript
{
  limit: 10,                               // Max invoices (default: 10, max: 100)
  starting_after: "in_123",                // Pagination cursor
  ending_before: "in_456",                 // Pagination cursor
  customer: "cus_123",                     // Filter by customer
  status: "paid",                          // Filter by status
  subscription: "sub_123",                 // Filter by subscription
  created: {                               // Filter by creation date
    gte: 1609459200,
    lte: 1640995200
  }
}
```

**Invoice statuses**:
- `draft` - Invoice is still being edited
- `open` - Invoice has been finalized and is awaiting payment
- `paid` - Invoice has been paid
- `uncollectible` - Invoice has been marked uncollectible
- `void` - Invoice has been voided

#### `stripe_get_invoice`
Retrieve details of a specific invoice.

```typescript
{
  invoice_id: "in_123456789"               // Required: invoice ID
}
```

### Subscription Tools

#### `stripe_list_subscriptions`
List subscriptions with filtering.

```typescript
{
  limit: 10,                               // Max subscriptions (default: 10, max: 100)
  starting_after: "sub_123",               // Pagination cursor
  ending_before: "sub_456",                // Pagination cursor
  customer: "cus_123",                     // Filter by customer
  price: "price_123",                      // Filter by price
  status: "active",                        // Filter by status
  created: {                               // Filter by creation date
    gte: 1609459200
  }
}
```

**Subscription statuses**:
- `active` - Subscription is active
- `past_due` - Latest invoice payment failed
- `unpaid` - Latest invoice is unpaid
- `canceled` - Subscription has been canceled
- `incomplete` - First invoice is not paid
- `incomplete_expired` - First invoice not paid within 23 hours
- `trialing` - Subscription is in trial period

#### `stripe_get_subscription`
Retrieve details of a specific subscription.

```typescript
{
  subscription_id: "sub_123456789"         // Required: subscription ID
}
```

### Balance Tools

#### `stripe_get_balance`
Retrieve the current balance of your Stripe account.

```typescript
{}  // No parameters required
```

#### `stripe_list_balance_transactions`
List balance transactions.

```typescript
{
  limit: 10,                               // Max transactions (default: 10, max: 100)
  starting_after: "txn_123",               // Pagination cursor
  ending_before: "txn_456",                // Pagination cursor
  type: "charge",                          // Filter by type
  payout: "po_123",                        // Filter by payout
  created: {                               // Filter by creation date
    gte: 1609459200,
    lte: 1640995200
  }
}
```

**Common transaction types**:
- `charge` - Charge from a customer
- `refund` - Refund to a customer
- `adjustment` - Account adjustment
- `application_fee` - Application fee
- `application_fee_refund` - Application fee refund
- `transfer` - Transfer to connected account
- `payment` - Payment received
- `payout` - Payout to bank account

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export STRIPE_CLIENT_ID=ca_your_client_id
export STRIPE_CLIENT_SECRET=sk_your_secret_key

./scripts/test-stripe-oauth.sh
```

The test script will:
1. Verify API health
2. Check Stripe service configuration
3. Initiate OAuth flow
4. Guide you through Stripe authorization
5. Verify credentials storage and encryption
6. Test Stripe API calls with read-only permissions
7. Verify account access and data retrieval

## Usage Examples

### Listing Customers

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_list_customers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20,
    "email": "customer@example.com"
  }'
```

### Getting a Specific Customer

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_get_customer \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cus_NffrFeUfNV2Hib"
  }'
```

### Listing Recent Payments

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_list_payments \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "created": {
      "gte": 1609459200
    }
  }'
```

### Getting Payment Details

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_get_payment \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "pi_3N7yMo2eZvKYlo2C0123456"
  }'
```

### Listing Paid Invoices

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_list_invoices \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "status": "paid"
  }'
```

### Listing Active Subscriptions

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_list_subscriptions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "active",
    "limit": 20
  }'
```

### Getting Account Balance

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_get_balance \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Listing Recent Balance Transactions

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/stripe_list_balance_transactions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "type": "charge"
  }'
```

## Stripe API Documentation

- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Connect OAuth](https://stripe.com/docs/connect/oauth-reference)
- [Customers API](https://stripe.com/docs/api/customers)
- [Payment Intents API](https://stripe.com/docs/api/payment_intents)
- [Invoices API](https://stripe.com/docs/api/invoices)
- [Subscriptions API](https://stripe.com/docs/api/subscriptions)
- [Balance API](https://stripe.com/docs/api/balance)

## Troubleshooting

### Invalid Client Error

If you get an "invalid_client" error:
1. Verify your Client ID starts with `ca_`
2. Ensure your Client Secret is correct and not expired
3. Check that Connect is properly configured in your Stripe dashboard

### Invalid Grant Error

This usually means the authorization code has expired or been used:
1. Authorization codes are single-use only
2. They expire quickly (within minutes)
3. Start a new authorization flow

### Insufficient Permissions Error

If you get permission errors:
1. Verify the `read_only` scope is properly configured
2. Check that the connected account granted permissions
3. Some resources may require additional verification in Stripe

### Invalid Request Error

If API calls fail:
1. Verify object IDs are correct (e.g., `cus_`, `pi_`, `in_`)
2. Check that the object exists in the connected account
3. Ensure the account has access to the requested resource

## Rate Limits

Stripe API has the following rate limits:
- **Read operations**: 100 requests per second (default)
- **Burst capacity**: Up to 1000 requests in short bursts

Monitor your API usage in the [Stripe Dashboard](https://dashboard.stripe.com/developers).

Stripe uses a leaky bucket algorithm. If you exceed limits:
- You'll receive a `429 Too Many Requests` response
- Implement exponential backoff and retry logic

## Security Considerations

- **Read-only access**: This integration only uses `read_only` scope for maximum security
- **HTTPS required**: Always use HTTPS for redirect URIs in production
- **Secure credentials**: Never expose your Client Secret client-side
- **Token storage**: Access tokens are encrypted at rest in Authlane
- **Webhook verification**: Use webhook signatures for event verification
- **Regular audits**: Review connected accounts in Stripe Dashboard
- **Monitor activity**: Set up alerts for unusual API usage
- **Rotate secrets**: Regularly rotate your OAuth client secrets

## Best Practices

1. **Use pagination**: Large datasets require cursor-based pagination
2. **Filter queries**: Use filters to reduce data transfer and improve performance
3. **Handle errors**: Implement proper error handling and retry logic
4. **Cache data**: Cache frequently accessed data (e.g., customer lists)
5. **Monitor quotas**: Track API usage to stay within rate limits
6. **Use webhooks**: For real-time updates, use Stripe webhooks instead of polling
7. **Test thoroughly**: Test with Stripe test mode before using live keys
8. **Handle currency**: Always handle amounts in smallest currency unit (cents)
9. **Verify data**: Cross-reference critical data with Stripe Dashboard
10. **Document integrations**: Keep track of which accounts are connected

## Differences from Full Stripe SDK

This integration provides **read-only** access for security. For write operations, use the official Stripe SDK directly:

**Not supported** (by design):
- Creating or modifying customers
- Processing payments or refunds
- Creating or updating subscriptions
- Modifying invoices
- Account configuration changes

**Supported** (read-only):
- Listing and retrieving all resources
- Viewing account balance
- Accessing transaction history
- Reading subscription status
- Viewing customer information

For applications requiring write access, consider using the [Stripe Node.js SDK](https://github.com/stripe/stripe-node) directly with API keys instead of OAuth.

## Common Use Cases

### Analytics Dashboard
List payments, charges, and balance transactions to build analytics dashboards showing revenue, customer growth, and payment trends.

### Customer Support
Retrieve customer information, subscription status, and invoice history to assist with support inquiries.

### Reporting
Generate reports on paid invoices, active subscriptions, and balance transactions for financial analysis.

### Monitoring
Check account balance and recent transactions to monitor business health and detect anomalies.

### Integration Verification
Verify payment status and subscription state before granting access to services or features.

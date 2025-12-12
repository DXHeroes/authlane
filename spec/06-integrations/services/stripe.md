# Stripe Integration

Connect to Stripe for payment and account data access via OAuth.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `stripe` |
| **Name** | Stripe |
| **Auth Type** | OAuth 2.0 (Stripe Connect) |
| **Documentation** | [Stripe Connect](https://stripe.com/docs/connect) |

## Important Note

This integration connects to **user Stripe accounts** via Stripe Connect OAuth. It is **NOT** for processing payments for Authlane subscriptions.

Use cases:
- Access user's Stripe account data
- Read customer and transaction information
- Build tools that interact with user's Stripe account

## OAuth Configuration

### Authorization URL
```
https://connect.stripe.com/oauth/authorize
```

### Token URL
```
https://connect.stripe.com/oauth/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `read_only` | Read-only access to account data |

### Default Scopes

```yaml
- read_only
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'stripe',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'stripe',
});

// The access_token is actually a Stripe account ID
// Use it with the Stripe API
const stripeAccountId = creds.access_token;

// List customers on the connected account
const response = await fetch(
  'https://api.stripe.com/v1/customers',
  {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Stripe-Account': stripeAccountId,
    },
  }
);
```

## Available Tools

### stripe_list_customers
List customers on the connected account.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'stripe_list_customers',
  parameters: {
    limit: 25,
  },
});
```

### stripe_list_payments
List payment intents.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'stripe_list_payments',
  parameters: {
    limit: 50,
    status: 'succeeded',
  },
});
```

### stripe_get_balance
Get account balance.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'stripe_get_balance',
  parameters: {},
});
```

## Setup Guide

### 1. Create Stripe Connect Application

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to Connect → Settings
3. Fill in platform profile information

### 2. Configure OAuth

1. In Connect settings, find OAuth settings
2. Add redirect URI: `https://your-domain.com/api/v1/oauth/callback/stripe`
3. Copy Client ID from Connect settings

### 3. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'stripe',
  clientId: 'ca_your-client-id',
  clientSecret: 'your-stripe-secret-key', // Your platform's secret key
});
```

## Stripe Connect Types

Stripe Connect supports different account types:

| Type | Description |
|------|-------------|
| Standard | User has own Stripe dashboard |
| Express | Limited dashboard, your branding |
| Custom | Full white-label, you handle everything |

This integration works with **Standard** accounts via OAuth.

## Important Considerations

### Platform Responsibility

When using Stripe Connect:
- Your platform is responsible for compliance
- Connected accounts trust your platform
- Handle data securely

### Read-Only Access

Default scope is `read_only`. This allows:
- Reading customer data
- Viewing transactions
- Getting account info

But does NOT allow:
- Creating charges
- Modifying account settings
- Transferring funds

### Not for Authlane Billing

This integration is for connecting to **user Stripe accounts**, not for:
- Processing Authlane subscription payments
- Managing Authlane billing

For Authlane subscription payments, see [Pricing](../../00-overview/pricing.md).

## Links

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [OAuth Reference](https://stripe.com/docs/connect/oauth-reference)
- [API Reference](https://stripe.com/docs/api)


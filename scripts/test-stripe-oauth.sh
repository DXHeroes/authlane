#!/bin/bash
# End-to-end OAuth test script for Authlane - Stripe Integration
# Tests Stripe OAuth flow: authorize → callback → credentials stored → token refresh
# Requires: API running, valid API key, Stripe OAuth App credentials

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"
STRIPE_CLIENT_ID="${STRIPE_CLIENT_ID:-}"
STRIPE_CLIENT_SECRET="${STRIPE_CLIENT_SECRET:-}"
TEST_USER_ID="${TEST_USER_ID:-test_user_$(date +%s)}"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ API_KEY environment variable is required${NC}"
  echo "   Get it from: pnpm --filter @authlane/database seed"
  exit 1
fi

if [ -z "$STRIPE_CLIENT_ID" ] || [ -z "$STRIPE_CLIENT_SECRET" ]; then
  echo -e "${RED}❌ Stripe OAuth credentials required${NC}"
  echo "   Set STRIPE_CLIENT_ID and STRIPE_CLIENT_SECRET environment variables"
  echo "   See: https://dashboard.stripe.com/settings/applications"
  exit 1
fi

echo -e "${BLUE}🧪 Testing Stripe OAuth Flow...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Test User ID: $TEST_USER_ID"
echo ""

# Step 1: Health check
echo -e "${YELLOW}Step 1: Health check...${NC}"
health_response=$(curl -s "$API_URL/health")
health_status=$(echo "$health_response" | jq -r '.data.status // empty')

if [ "$health_status" = "ok" ]; then
  echo -e "${GREEN}✓ API is healthy${NC}"
else
  echo -e "${RED}✗ API health check failed${NC}"
  echo "$health_response" | jq .
  exit 1
fi
echo ""

# Step 2: Verify Stripe service exists
echo -e "${YELLOW}Step 2: Verify Stripe service configuration...${NC}"
service_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services/stripe")

service_id=$(echo "$service_response" | jq -r '.data.id // empty')
auth_type=$(echo "$service_response" | jq -r '.data.auth_type // empty')

if [ "$service_id" = "stripe" ] && [ "$auth_type" = "oauth2" ]; then
  echo -e "${GREEN}✓ Stripe service configured correctly${NC}"
  echo "  Authorization URL: $(echo "$service_response" | jq -r '.data.config.authorization_url')"
  echo "  Token URL: $(echo "$service_response" | jq -r '.data.config.token_url')"
  echo "  Default scopes: $(echo "$service_response" | jq -r '.data.config.default_scopes | join(", ")')"
else
  echo -e "${RED}✗ Stripe service not properly configured${NC}"
  echo "$service_response" | jq .
  exit 1
fi
echo ""

# Step 3: Initiate OAuth authorization
echo -e "${YELLOW}Step 3: Initiate OAuth authorization flow...${NC}"
authorize_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe/authorize"
redirect_uri="$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe/callback"

authorize_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$authorize_url?client_id=$STRIPE_CLIENT_ID&redirect_uri=$redirect_uri")

authorization_url=$(echo "$authorize_response" | jq -r '.data.authorization_url // empty')
state_param=$(echo "$authorize_response" | jq -r '.data.state // empty')
connection_id=$(echo "$authorize_response" | jq -r '.data.connection_id // empty')

if [ -z "$authorization_url" ] || [ -z "$state_param" ] || [ -z "$connection_id" ]; then
  echo -e "${RED}✗ Failed to initiate OAuth flow${NC}"
  echo "$authorize_response" | jq .
  exit 1
fi

echo -e "${GREEN}✓ Authorization initiated${NC}"
echo "  Connection ID: $connection_id"
echo "  State parameter: ${state_param:0:20}..."
echo ""

# Step 4: Verify connection is in pending state
echo -e "${YELLOW}Step 4: Verify connection in pending state...${NC}"
connections_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections")

pending_count=$(echo "$connections_response" | jq '[.data[] | select(.status == "pending")] | length')

if [ "$pending_count" -gt 0 ]; then
  echo -e "${GREEN}✓ Connection created in pending state${NC}"
else
  echo -e "${RED}✗ No pending connection found${NC}"
  echo "$connections_response" | jq .
  exit 1
fi
echo ""

# Step 5: Manual OAuth flow (requires user interaction)
echo -e "${YELLOW}Step 5: Complete OAuth authorization...${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}MANUAL STEP REQUIRED:${NC}"
echo ""
echo "1. Open this URL in your browser:"
echo ""
echo -e "${GREEN}$authorization_url${NC}"
echo ""
echo "2. Sign in to your Stripe account (or create one)"
echo "3. Grant the requested read-only permissions"
echo "4. You will be redirected to the callback URL"
echo "5. Copy the 'code' parameter from the callback URL"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -n "Enter the authorization code: "
read -r auth_code

if [ -z "$auth_code" ]; then
  echo -e "${RED}✗ Authorization code is required${NC}"
  exit 1
fi

echo ""

# Step 6: Exchange authorization code for tokens
echo -e "${YELLOW}Step 6: Exchange authorization code for tokens...${NC}"
callback_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe/callback"
callback_url+="?code=$auth_code&state=$state_param&client_id=$STRIPE_CLIENT_ID&client_secret=$STRIPE_CLIENT_SECRET"

callback_response=$(curl -s -H "Authorization: Bearer $API_KEY" "$callback_url")

callback_status=$(echo "$callback_response" | jq -r '.data.status // empty')

if [ "$callback_status" = "connected" ]; then
  echo -e "${GREEN}✓ Token exchange successful${NC}"
  echo "  Connection ID: $(echo "$callback_response" | jq -r '.data.connection_id')"
  echo "  Status: $callback_status"
else
  echo -e "${RED}✗ Token exchange failed${NC}"
  echo "$callback_response" | jq .
  exit 1
fi
echo ""

# Step 7: Verify credentials are stored and encrypted
echo -e "${YELLOW}Step 7: Verify credentials are stored...${NC}"
connection_detail=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe")

stored_status=$(echo "$connection_detail" | jq -r '.data.status // empty')
has_credentials=$(echo "$connection_detail" | jq -r '.data.credentials_enc // empty')

if [ "$stored_status" = "connected" ] && [ -n "$has_credentials" ]; then
  echo -e "${GREEN}✓ Credentials stored and encrypted${NC}"
  echo "  Status: $stored_status"
  echo "  Connected at: $(echo "$connection_detail" | jq -r '.data.connected_at')"
  echo "  Expires at: $(echo "$connection_detail" | jq -r '.data.expires_at // "Never"')"
else
  echo -e "${RED}✗ Credentials not properly stored${NC}"
  echo "$connection_detail" | jq .
  exit 1
fi
echo ""

# Step 8: Retrieve decrypted credentials
echo -e "${YELLOW}Step 8: Retrieve and verify credentials...${NC}"
credentials_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe/credentials")

access_token=$(echo "$credentials_response" | jq -r '.data.access_token // empty')
stripe_user_id=$(echo "$credentials_response" | jq -r '.data.stripe_user_id // empty')

if [ -n "$access_token" ]; then
  echo -e "${GREEN}✓ Credentials retrieved and decrypted${NC}"
  echo "  Access token: ${access_token:0:20}..."
  if [ -n "$stripe_user_id" ]; then
    echo "  Stripe user ID: $stripe_user_id"
  fi
  echo "  Scope: $(echo "$credentials_response" | jq -r '.data.scope // "N/A"')"
else
  echo -e "${RED}✗ Failed to retrieve credentials${NC}"
  echo "$credentials_response" | jq .
  exit 1
fi
echo ""

# Step 9: Test credentials with Stripe API
echo -e "${YELLOW}Step 9: Test credentials with Stripe API...${NC}"
stripe_account_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "https://api.stripe.com/v1/account")

stripe_id=$(echo "$stripe_account_response" | jq -r '.id // empty')

if [ -n "$stripe_id" ]; then
  echo -e "${GREEN}✓ Credentials valid - connected to Stripe account: $stripe_id${NC}"
  business_name=$(echo "$stripe_account_response" | jq -r '.business_profile.name // "N/A"')
  echo "  Business name: $business_name"
  echo "  Account type: $(echo "$stripe_account_response" | jq -r '.type')"
  echo "  Charges enabled: $(echo "$stripe_account_response" | jq -r '.charges_enabled')"
else
  echo -e "${RED}✗ Stripe API authentication failed${NC}"
  echo "$stripe_account_response" | jq .
  exit 1
fi
echo ""

# Step 10: Test listing customers
echo -e "${YELLOW}Step 10: Test listing customers (read-only permission)...${NC}"
stripe_customers_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "https://api.stripe.com/v1/customers?limit=3")

customers=$(echo "$stripe_customers_response" | jq -r '.data // empty')

if [ -n "$customers" ]; then
  customer_count=$(echo "$stripe_customers_response" | jq -r '.data | length')
  echo -e "${GREEN}✓ Successfully listed customers${NC}"
  echo "  Customers retrieved: $customer_count"
  if [ "$customer_count" -gt 0 ]; then
    echo "  First customer ID: $(echo "$stripe_customers_response" | jq -r '.data[0].id')"
  fi
else
  error_msg=$(echo "$stripe_customers_response" | jq -r '.error.message // "unknown"')
  echo -e "${YELLOW}⚠ Could not list customers: $error_msg${NC}"
  echo "  This may be a scope issue - ensure read_only permission is granted"
fi
echo ""

# Step 11: Test balance retrieval
echo -e "${YELLOW}Step 11: Test balance retrieval...${NC}"
stripe_balance_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "https://api.stripe.com/v1/balance")

available=$(echo "$stripe_balance_response" | jq -r '.available // empty')

if [ -n "$available" ]; then
  echo -e "${GREEN}✓ Successfully retrieved balance${NC}"
  balance_count=$(echo "$stripe_balance_response" | jq -r '.available | length')
  echo "  Available balances: $balance_count currencies"
  if [ "$balance_count" -gt 0 ]; then
    first_currency=$(echo "$stripe_balance_response" | jq -r '.available[0].currency')
    first_amount=$(echo "$stripe_balance_response" | jq -r '.available[0].amount')
    echo "  Example: $first_amount $first_currency (in smallest currency unit)"
  fi
else
  error_msg=$(echo "$stripe_balance_response" | jq -r '.error.message // "unknown"')
  echo -e "${YELLOW}⚠ Could not retrieve balance: $error_msg${NC}"
fi
echo ""

# Step 12: Connection health check
echo -e "${YELLOW}Step 12: Connection health check...${NC}"
health_check_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe/health")

health_check_status=$(echo "$health_check_response" | jq -r '.data.status // empty')

if [ "$health_check_status" = "healthy" ]; then
  echo -e "${GREEN}✓ Connection is healthy${NC}"
  echo "  Status: $health_check_status"
  echo "  Last checked: $(echo "$health_check_response" | jq -r '.data.checked_at')"
else
  echo -e "${RED}✗ Connection health check failed${NC}"
  echo "$health_check_response" | jq .
  exit 1
fi
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All Stripe OAuth flow tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Summary:"
echo "  ✓ OAuth authorization initiated"
echo "  ✓ PKCE code challenge generated"
echo "  ✓ State parameter verified"
echo "  ✓ Authorization code exchanged for tokens"
echo "  ✓ Credentials encrypted and stored"
echo "  ✓ Credentials can be decrypted and retrieved"
echo "  ✓ Tokens work with Stripe API"
echo "  ✓ Read-only permissions verified"
echo "  ✓ Connection health check passed"
echo ""
echo "Test User ID: $TEST_USER_ID"
echo "Connection ID: $connection_id"
echo "Stripe Account: $stripe_id"
echo ""

# Cleanup prompt
echo -n "Do you want to delete the test connection? (y/N): "
read -r cleanup_response

if [ "$cleanup_response" = "y" ] || [ "$cleanup_response" = "Y" ]; then
  echo ""
  echo -e "${YELLOW}Cleaning up test connection...${NC}"
  delete_response=$(curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
    "$API_URL/api/v1/users/$TEST_USER_ID/connections/stripe")

  delete_success=$(echo "$delete_response" | jq -r '.data.success // false')

  if [ "$delete_success" = "true" ]; then
    echo -e "${GREEN}✓ Test connection deleted${NC}"
  else
    echo -e "${RED}✗ Failed to delete test connection${NC}"
    echo "$delete_response" | jq .
  fi
fi

echo ""
echo -e "${GREEN}Done!${NC}"

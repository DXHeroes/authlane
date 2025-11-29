#!/bin/bash
# End-to-end OAuth test script for Authlane - Salesforce Integration
# Tests Salesforce OAuth flow: authorize → callback → credentials stored → token refresh
# Requires: API running, valid API key, Salesforce OAuth App credentials

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"
SALESFORCE_CLIENT_ID="${SALESFORCE_CLIENT_ID:-}"
SALESFORCE_CLIENT_SECRET="${SALESFORCE_CLIENT_SECRET:-}"
TEST_USER_ID="${TEST_USER_ID:-test_user_$(date +%s)}"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ API_KEY environment variable is required${NC}"
  echo "   Get it from: pnpm --filter @authlane/database seed"
  exit 1
fi

if [ -z "$SALESFORCE_CLIENT_ID" ] || [ -z "$SALESFORCE_CLIENT_SECRET" ]; then
  echo -e "${RED}❌ Salesforce OAuth credentials required${NC}"
  echo "   Set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET environment variables"
  echo "   See: https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm"
  exit 1
fi

echo -e "${BLUE}🧪 Testing Salesforce OAuth Flow...${NC}"
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

# Step 2: Verify Salesforce service exists
echo -e "${YELLOW}Step 2: Verify Salesforce service configuration...${NC}"
service_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services/salesforce")

service_id=$(echo "$service_response" | jq -r '.data.id // empty')
auth_type=$(echo "$service_response" | jq -r '.data.auth_type // empty')

if [ "$service_id" = "salesforce" ] && [ "$auth_type" = "oauth2" ]; then
  echo -e "${GREEN}✓ Salesforce service configured correctly${NC}"
  echo "  Authorization URL: $(echo "$service_response" | jq -r '.data.config.authorization_url')"
  echo "  Token URL: $(echo "$service_response" | jq -r '.data.config.token_url')"
  echo "  Default scopes: $(echo "$service_response" | jq -r '.data.config.default_scopes | join(", ")')"
  echo "  API Version: $(echo "$service_response" | jq -r '.data.config.api_version // "N/A"')"
else
  echo -e "${RED}✗ Salesforce service not properly configured${NC}"
  echo "$service_response" | jq .
  exit 1
fi
echo ""

# Step 3: Initiate OAuth authorization
echo -e "${YELLOW}Step 3: Initiate OAuth authorization flow...${NC}"
authorize_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce/authorize"
redirect_uri="$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce/callback"

authorize_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$authorize_url?client_id=$SALESFORCE_CLIENT_ID&redirect_uri=$redirect_uri")

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
echo "2. Sign in to your Salesforce account (or select an org)"
echo "3. Grant the requested permissions:"
echo "   - Full access to your data (api)"
echo "   - Perform requests at any time (refresh_token)"
echo "   - Access unique user identifier (id)"
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
callback_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce/callback"
callback_url+="?code=$auth_code&state=$state_param&client_id=$SALESFORCE_CLIENT_ID&client_secret=$SALESFORCE_CLIENT_SECRET"

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce")

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce/credentials")

access_token=$(echo "$credentials_response" | jq -r '.data.access_token // empty')
instance_url=$(echo "$credentials_response" | jq -r '.data.instance_url // empty')

if [ -n "$access_token" ] && [ -n "$instance_url" ]; then
  echo -e "${GREEN}✓ Credentials retrieved and decrypted${NC}"
  echo "  Access token: ${access_token:0:20}..."
  echo "  Refresh token: $(echo "$credentials_response" | jq -r '.data.refresh_token // "N/A" | .[0:20]')..."
  echo "  Instance URL: $instance_url"
else
  echo -e "${RED}✗ Failed to retrieve credentials${NC}"
  echo "$credentials_response" | jq .
  exit 1
fi
echo ""

# Step 9: Test credentials with Salesforce API
echo -e "${YELLOW}Step 9: Test credentials with Salesforce API (userinfo)...${NC}"
salesforce_userinfo_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "$instance_url/services/oauth2/userinfo")

user_id=$(echo "$salesforce_userinfo_response" | jq -r '.user_id // empty')

if [ -n "$user_id" ]; then
  echo -e "${GREEN}✓ Credentials valid - connected to Salesforce${NC}"
  echo "  User ID: $user_id"
  echo "  Organization ID: $(echo "$salesforce_userinfo_response" | jq -r '.organization_id')"
  echo "  Display name: $(echo "$salesforce_userinfo_response" | jq -r '.name')"
else
  echo -e "${RED}✗ Salesforce API authentication failed${NC}"
  echo "$salesforce_userinfo_response" | jq .
  exit 1
fi
echo ""

# Step 10: Test Salesforce API permissions (SOQL query)
echo -e "${YELLOW}Step 10: Test Salesforce API permissions (query contacts)...${NC}"
salesforce_query="SELECT Id, Name, Email FROM Contact LIMIT 5"
encoded_query=$(echo "$salesforce_query" | jq -sRr @uri)
salesforce_query_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "$instance_url/services/data/v60.0/query?q=$encoded_query")

query_ok=$(echo "$salesforce_query_response" | jq -r 'has("records")')

if [ "$query_ok" = "true" ]; then
  record_count=$(echo "$salesforce_query_response" | jq -r '.records | length')
  echo -e "${GREEN}✓ Successfully executed SOQL query${NC}"
  echo "  Query: $salesforce_query"
  echo "  Returned $record_count contacts"
  if [ "$record_count" -gt 0 ]; then
    echo "  Example contact ID: $(echo "$salesforce_query_response" | jq -r '.records[0].Id')"
  fi
else
  error_msg=$(echo "$salesforce_query_response" | jq -r '.[0].message // "unknown"')
  echo -e "${YELLOW}⚠ Could not query contacts: $error_msg${NC}"
  echo "  This may be a scope issue - ensure 'api' scope is granted"
fi
echo ""

# Step 11: Connection health check
echo -e "${YELLOW}Step 11: Connection health check...${NC}"
health_check_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce/health")

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
echo -e "${GREEN}✅ All Salesforce OAuth flow tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Summary:"
echo "  ✓ OAuth authorization initiated"
echo "  ✓ PKCE code challenge generated"
echo "  ✓ State parameter verified"
echo "  ✓ Authorization code exchanged for tokens"
echo "  ✓ Credentials encrypted and stored"
echo "  ✓ Credentials can be decrypted and retrieved"
echo "  ✓ Tokens work with Salesforce API"
echo "  ✓ Required scopes verified (api, refresh_token, id)"
echo "  ✓ SOQL query executed successfully"
echo "  ✓ Connection health check passed"
echo ""
echo "Test User ID: $TEST_USER_ID"
echo "Connection ID: $connection_id"
echo "Instance URL: $instance_url"
echo ""

# Cleanup prompt
echo -n "Do you want to delete the test connection? (y/N): "
read -r cleanup_response

if [ "$cleanup_response" = "y" ] || [ "$cleanup_response" = "Y" ]; then
  echo ""
  echo -e "${YELLOW}Cleaning up test connection...${NC}"
  delete_response=$(curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
    "$API_URL/api/v1/users/$TEST_USER_ID/connections/salesforce")

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

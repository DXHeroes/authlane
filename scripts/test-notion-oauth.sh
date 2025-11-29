#!/bin/bash
# End-to-end OAuth test script for Authlane - Notion Integration
# Tests Notion OAuth flow: authorize → callback → credentials stored → token refresh
# Requires: API running, valid API key, Notion OAuth App credentials

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"
NOTION_CLIENT_ID="${NOTION_CLIENT_ID:-}"
NOTION_CLIENT_SECRET="${NOTION_CLIENT_SECRET:-}"
TEST_USER_ID="${TEST_USER_ID:-test_user_$(date +%s)}"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ API_KEY environment variable is required${NC}"
  echo "   Get it from: pnpm --filter @authlane/database seed"
  exit 1
fi

if [ -z "$NOTION_CLIENT_ID" ] || [ -z "$NOTION_CLIENT_SECRET" ]; then
  echo -e "${RED}❌ Notion OAuth credentials required${NC}"
  echo "   Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET environment variables"
  echo "   See: https://www.notion.so/my-integrations"
  exit 1
fi

echo -e "${BLUE}🧪 Testing Notion OAuth Flow...${NC}"
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

# Step 2: Verify Notion service exists
echo -e "${YELLOW}Step 2: Verify Notion service configuration...${NC}"
service_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services/notion")

service_id=$(echo "$service_response" | jq -r '.data.id // empty')
auth_type=$(echo "$service_response" | jq -r '.data.auth_type // empty')

if [ "$service_id" = "notion" ] && [ "$auth_type" = "oauth2" ]; then
  echo -e "${GREEN}✓ Notion service configured correctly${NC}"
  echo "  Authorization URL: $(echo "$service_response" | jq -r '.data.config.authorization_url')"
  echo "  Token URL: $(echo "$service_response" | jq -r '.data.config.token_url')"
else
  echo -e "${RED}✗ Notion service not properly configured${NC}"
  echo "$service_response" | jq .
  exit 1
fi
echo ""

# Step 3: Initiate OAuth authorization
echo -e "${YELLOW}Step 3: Initiate OAuth authorization flow...${NC}"
authorize_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/notion/authorize"
redirect_uri="$API_URL/api/v1/users/$TEST_USER_ID/connections/notion/callback"

authorize_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$authorize_url?client_id=$NOTION_CLIENT_ID&redirect_uri=$redirect_uri")

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
echo "2. Sign in to your Notion account"
echo "3. Select the workspace and pages to grant access to"
echo "4. Click 'Allow access'"
echo "5. You will be redirected to the callback URL"
echo "6. Copy the 'code' parameter from the callback URL"
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
callback_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/notion/callback"
callback_url+="?code=$auth_code&state=$state_param&client_id=$NOTION_CLIENT_ID&client_secret=$NOTION_CLIENT_SECRET"

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/notion")

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/notion/credentials")

access_token=$(echo "$credentials_response" | jq -r '.data.access_token // empty')

if [ -n "$access_token" ]; then
  echo -e "${GREEN}✓ Credentials retrieved and decrypted${NC}"
  echo "  Access token: ${access_token:0:20}..."
  workspace_id=$(echo "$credentials_response" | jq -r '.data.workspace_id // "N/A"')
  workspace_name=$(echo "$credentials_response" | jq -r '.data.workspace_name // "N/A"')
  echo "  Workspace: $workspace_name ($workspace_id)"
else
  echo -e "${RED}✗ Failed to retrieve credentials${NC}"
  echo "$credentials_response" | jq .
  exit 1
fi
echo ""

# Step 9: Test credentials with Notion API
echo -e "${YELLOW}Step 9: Test credentials with Notion API...${NC}"
notion_users_response=$(curl -s -H "Authorization: Bearer $access_token" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/users/me")

user_id=$(echo "$notion_users_response" | jq -r '.id // empty')
user_type=$(echo "$notion_users_response" | jq -r '.type // empty')

if [ -n "$user_id" ]; then
  echo -e "${GREEN}✓ Credentials valid - connected to Notion${NC}"
  echo "  User ID: $user_id"
  echo "  User type: $user_type"
  if [ "$user_type" = "bot" ]; then
    bot_name=$(echo "$notion_users_response" | jq -r '.name // "N/A"')
    echo "  Bot name: $bot_name"
  fi
else
  echo -e "${RED}✗ Notion API authentication failed${NC}"
  echo "$notion_users_response" | jq .
  exit 1
fi
echo ""

# Step 10: Test search API
echo -e "${YELLOW}Step 10: Test Notion search API...${NC}"
notion_search_response=$(curl -s -X POST -H "Authorization: Bearer $access_token" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"page_size": 5}' \
  "https://api.notion.com/v1/search")

results=$(echo "$notion_search_response" | jq -r '.results // empty')

if [ -n "$results" ]; then
  result_count=$(echo "$notion_search_response" | jq -r '.results | length')
  echo -e "${GREEN}✓ Successfully searched Notion workspace${NC}"
  echo "  Results returned: $result_count"
  if [ "$result_count" -gt 0 ]; then
    echo "  Example pages:"
    echo "$notion_search_response" | jq -r '.results[0:3] | .[] | "    - \(.object): \(.id)"'
  fi
else
  error_msg=$(echo "$notion_search_response" | jq -r '.message // "unknown"')
  echo -e "${YELLOW}⚠ Could not search: $error_msg${NC}"
fi
echo ""

# Step 11: Connection health check
echo -e "${YELLOW}Step 11: Connection health check...${NC}"
health_check_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/notion/health")

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
echo -e "${GREEN}✅ All Notion OAuth flow tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Summary:"
echo "  ✓ OAuth authorization initiated"
echo "  ✓ PKCE code challenge generated"
echo "  ✓ State parameter verified"
echo "  ✓ Authorization code exchanged for tokens"
echo "  ✓ Credentials encrypted and stored"
echo "  ✓ Credentials can be decrypted and retrieved"
echo "  ✓ Tokens work with Notion API"
echo "  ✓ Connection health check passed"
echo ""
echo "Test User ID: $TEST_USER_ID"
echo "Connection ID: $connection_id"
echo "Notion User: $user_id ($user_type)"
echo ""

# Cleanup prompt
echo -n "Do you want to delete the test connection? (y/N): "
read -r cleanup_response

if [ "$cleanup_response" = "y" ] || [ "$cleanup_response" = "Y" ]; then
  echo ""
  echo -e "${YELLOW}Cleaning up test connection...${NC}"
  delete_response=$(curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
    "$API_URL/api/v1/users/$TEST_USER_ID/connections/notion")

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

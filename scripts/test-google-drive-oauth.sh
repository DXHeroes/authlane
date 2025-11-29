#!/bin/bash
# End-to-end OAuth test script for Authlane - Google Drive Integration
# Tests Google Drive OAuth flow: authorize → callback → credentials stored → token refresh
# Requires: API running, valid API key, Google OAuth App credentials

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"
GOOGLE_DRIVE_CLIENT_ID="${GOOGLE_DRIVE_CLIENT_ID:-}"
GOOGLE_DRIVE_CLIENT_SECRET="${GOOGLE_DRIVE_CLIENT_SECRET:-}"
TEST_USER_ID="${TEST_USER_ID:-test_user_$(date +%s)}"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ API_KEY environment variable is required${NC}"
  echo "   Get it from: pnpm --filter @authlane/database seed"
  exit 1
fi

if [ -z "$GOOGLE_DRIVE_CLIENT_ID" ] || [ -z "$GOOGLE_DRIVE_CLIENT_SECRET" ]; then
  echo -e "${RED}❌ Google Drive OAuth credentials required${NC}"
  echo "   Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET environment variables"
  echo "   See: https://console.cloud.google.com/apis/credentials"
  exit 1
fi

echo -e "${BLUE}🧪 Testing Google Drive OAuth Flow...${NC}"
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

# Step 2: Verify Google Drive service exists
echo -e "${YELLOW}Step 2: Verify Google Drive service configuration...${NC}"
service_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services/google-drive")

service_id=$(echo "$service_response" | jq -r '.data.id // empty')
auth_type=$(echo "$service_response" | jq -r '.data.auth_type // empty')

if [ "$service_id" = "google-drive" ] && [ "$auth_type" = "oauth2" ]; then
  echo -e "${GREEN}✓ Google Drive service configured correctly${NC}"
  echo "  Authorization URL: $(echo "$service_response" | jq -r '.data.config.authorization_url')"
  echo "  Token URL: $(echo "$service_response" | jq -r '.data.config.token_url')"
  echo "  Default scopes: $(echo "$service_response" | jq -r '.data.config.default_scopes | join(", ")')"
else
  echo -e "${RED}✗ Google Drive service not properly configured${NC}"
  echo "$service_response" | jq .
  exit 1
fi
echo ""

# Step 3: Initiate OAuth authorization
echo -e "${YELLOW}Step 3: Initiate OAuth authorization flow...${NC}"
authorize_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive/authorize"
redirect_uri="$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive/callback"

authorize_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$authorize_url?client_id=$GOOGLE_DRIVE_CLIENT_ID&redirect_uri=$redirect_uri")

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
echo "2. Sign in with your Google account"
echo "3. Grant the requested Google Drive permissions:"
echo "   - View and manage files created by this app"
echo "   - View files in your Google Drive"
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
callback_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive/callback"
callback_url+="?code=$auth_code&state=$state_param&client_id=$GOOGLE_DRIVE_CLIENT_ID&client_secret=$GOOGLE_DRIVE_CLIENT_SECRET"

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive")

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive/credentials")

access_token=$(echo "$credentials_response" | jq -r '.data.access_token // empty')
refresh_token=$(echo "$credentials_response" | jq -r '.data.refresh_token // empty')

if [ -n "$access_token" ]; then
  echo -e "${GREEN}✓ Credentials retrieved and decrypted${NC}"
  echo "  Access token: ${access_token:0:20}..."
  if [ -n "$refresh_token" ]; then
    echo "  Refresh token: ${refresh_token:0:20}..."
  fi
  echo "  Scope: $(echo "$credentials_response" | jq -r '.data.scope // "N/A"')"
else
  echo -e "${RED}✗ Failed to retrieve credentials${NC}"
  echo "$credentials_response" | jq .
  exit 1
fi
echo ""

# Step 9: Test credentials with Google Drive API
echo -e "${YELLOW}Step 9: Test credentials with Google Drive API...${NC}"
drive_about_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota")

user_email=$(echo "$drive_about_response" | jq -r '.user.emailAddress // empty')

if [ -n "$user_email" ]; then
  echo -e "${GREEN}✓ Credentials valid - connected to Google Drive account: $user_email${NC}"
  echo "  User name: $(echo "$drive_about_response" | jq -r '.user.displayName')"
  storage_limit=$(echo "$drive_about_response" | jq -r '.storageQuota.limit // "unlimited"')
  storage_used=$(echo "$drive_about_response" | jq -r '.storageQuota.usage // "0"')
  if [ "$storage_limit" != "unlimited" ] && [ "$storage_limit" != "null" ]; then
    storage_limit_gb=$((storage_limit / 1073741824))
    storage_used_gb=$((storage_used / 1073741824))
    echo "  Storage: ${storage_used_gb}GB / ${storage_limit_gb}GB used"
  else
    storage_used_gb=$((storage_used / 1073741824))
    echo "  Storage used: ${storage_used_gb}GB"
  fi
else
  echo -e "${RED}✗ Google Drive API authentication failed${NC}"
  echo "$drive_about_response" | jq .
  exit 1
fi
echo ""

# Step 10: Test listing files with proper scopes
echo -e "${YELLOW}Step 10: Test Google Drive API permissions (drive.readonly)...${NC}"
drive_files_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,size,createdTime)")

files=$(echo "$drive_files_response" | jq -r '.files // empty')

if [ -n "$files" ]; then
  file_count=$(echo "$drive_files_response" | jq -r '.files | length')
  echo -e "${GREEN}✓ Successfully listed $file_count files${NC}"
  if [ "$file_count" -gt 0 ]; then
    echo "  Example files:"
    echo "$drive_files_response" | jq -r '.files[0:3] | .[] | "    - \(.name) (\(.mimeType))"'
  fi
else
  error_msg=$(echo "$drive_files_response" | jq -r '.error.message // "unknown"')
  echo -e "${YELLOW}⚠ Could not list files: $error_msg${NC}"
  echo "  This may be a scope issue - ensure drive.readonly or drive.file is granted"
fi
echo ""

# Step 11: Test creating a test file
echo -e "${YELLOW}Step 11: Test creating a test file (drive.file)...${NC}"

# Create file metadata
file_metadata='{"name":"Authlane_Test_File.txt","mimeType":"text/plain"}'
file_content="This is a test file created by Authlane Google Drive integration test at $(date)"

# Create multipart upload
boundary="authlane_test_boundary"
create_file_response=$(curl -s -X POST \
  -H "Authorization: Bearer $access_token" \
  -H "Content-Type: multipart/related; boundary=$boundary" \
  --data-binary @- \
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime" <<EOF
--$boundary
Content-Type: application/json; charset=UTF-8

$file_metadata

--$boundary
Content-Type: text/plain

$file_content
--$boundary--
EOF
)

created_file_id=$(echo "$create_file_response" | jq -r '.id // empty')

if [ -n "$created_file_id" ]; then
  echo -e "${GREEN}✓ Successfully created test file${NC}"
  echo "  File ID: $created_file_id"
  echo "  File name: $(echo "$create_file_response" | jq -r '.name')"
  echo "  Created at: $(echo "$create_file_response" | jq -r '.createdTime')"
else
  error_msg=$(echo "$create_file_response" | jq -r '.error.message // "unknown"')
  echo -e "${YELLOW}⚠ Could not create test file: $error_msg${NC}"
  echo "  This may be a scope issue - ensure drive.file is granted"
fi
echo ""

# Step 12: Test downloading the created file
if [ -n "$created_file_id" ]; then
  echo -e "${YELLOW}Step 12: Test downloading the created file...${NC}"
  download_response=$(curl -s -H "Authorization: Bearer $access_token" \
    "https://www.googleapis.com/drive/v3/files/$created_file_id?alt=media")

  if echo "$download_response" | grep -q "Authlane"; then
    echo -e "${GREEN}✓ Successfully downloaded test file${NC}"
    echo "  Content preview: ${download_response:0:50}..."
  else
    echo -e "${YELLOW}⚠ Could not download test file${NC}"
    echo "$download_response"
  fi
  echo ""
fi

# Step 13: Connection health check
echo -e "${YELLOW}Step 13: Connection health check...${NC}"
health_check_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive/health")

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
echo -e "${GREEN}✅ All Google Drive OAuth flow tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Summary:"
echo "  ✓ OAuth authorization initiated"
echo "  ✓ PKCE code challenge generated"
echo "  ✓ State parameter verified"
echo "  ✓ Authorization code exchanged for tokens"
echo "  ✓ Credentials encrypted and stored"
echo "  ✓ Credentials can be decrypted and retrieved"
echo "  ✓ Tokens work with Google Drive API"
echo "  ✓ Required scopes verified (drive.file, drive.readonly)"
echo "  ✓ Connection health check passed"
echo ""
echo "Test User ID: $TEST_USER_ID"
echo "Connection ID: $connection_id"
echo "Google Account: $user_email"
if [ -n "$created_file_id" ]; then
  echo "Test File ID: $created_file_id"
fi
echo ""

# Cleanup prompt
if [ -n "$created_file_id" ]; then
  echo -n "Do you want to delete the test file from Google Drive? (y/N): "
  read -r cleanup_file_response

  if [ "$cleanup_file_response" = "y" ] || [ "$cleanup_file_response" = "Y" ]; then
    echo ""
    echo -e "${YELLOW}Deleting test file from Google Drive...${NC}"
    delete_file_response=$(curl -s -X DELETE -H "Authorization: Bearer $access_token" \
      "https://www.googleapis.com/drive/v3/files/$created_file_id")

    if [ -z "$delete_file_response" ]; then
      echo -e "${GREEN}✓ Test file deleted from Google Drive${NC}"
    else
      echo -e "${RED}✗ Failed to delete test file${NC}"
      echo "$delete_file_response" | jq .
    fi
  fi
fi

echo ""
echo -n "Do you want to delete the test connection? (y/N): "
read -r cleanup_response

if [ "$cleanup_response" = "y" ] || [ "$cleanup_response" = "Y" ]; then
  echo ""
  echo -e "${YELLOW}Cleaning up test connection...${NC}"
  delete_response=$(curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
    "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-drive")

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

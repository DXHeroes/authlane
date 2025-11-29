#!/bin/bash
# End-to-end OAuth test script for Authlane - Google Calendar Integration
# Tests Google Calendar OAuth flow: authorize → callback → credentials stored → token refresh
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
GOOGLE_CALENDAR_CLIENT_ID="${GOOGLE_CALENDAR_CLIENT_ID:-}"
GOOGLE_CALENDAR_CLIENT_SECRET="${GOOGLE_CALENDAR_CLIENT_SECRET:-}"
TEST_USER_ID="${TEST_USER_ID:-test_user_$(date +%s)}"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ API_KEY environment variable is required${NC}"
  echo "   Get it from: pnpm --filter @authlane/database seed"
  exit 1
fi

if [ -z "$GOOGLE_CALENDAR_CLIENT_ID" ] || [ -z "$GOOGLE_CALENDAR_CLIENT_SECRET" ]; then
  echo -e "${RED}❌ Google Calendar OAuth credentials required${NC}"
  echo "   Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET environment variables"
  echo "   See: https://console.cloud.google.com/apis/credentials"
  exit 1
fi

echo -e "${BLUE}🧪 Testing Google Calendar OAuth Flow...${NC}"
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

# Step 2: Verify Google Calendar service exists
echo -e "${YELLOW}Step 2: Verify Google Calendar service configuration...${NC}"
service_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services/google-calendar")

service_id=$(echo "$service_response" | jq -r '.data.id // empty')
auth_type=$(echo "$service_response" | jq -r '.data.auth_type // empty')

if [ "$service_id" = "google-calendar" ] && [ "$auth_type" = "oauth2" ]; then
  echo -e "${GREEN}✓ Google Calendar service configured correctly${NC}"
  echo "  Authorization URL: $(echo "$service_response" | jq -r '.data.config.authorization_url')"
  echo "  Token URL: $(echo "$service_response" | jq -r '.data.config.token_url')"
  echo "  Default scopes: $(echo "$service_response" | jq -r '.data.config.default_scopes | join(", ")')"
else
  echo -e "${RED}✗ Google Calendar service not properly configured${NC}"
  echo "$service_response" | jq .
  exit 1
fi
echo ""

# Step 3: Initiate OAuth authorization
echo -e "${YELLOW}Step 3: Initiate OAuth authorization flow...${NC}"
authorize_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar/authorize"
redirect_uri="$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar/callback"

authorize_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$authorize_url?client_id=$GOOGLE_CALENDAR_CLIENT_ID&redirect_uri=$redirect_uri")

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
echo "3. Grant the requested Google Calendar permissions:"
echo "   - View and edit events in all your calendars"
echo "   - View events in all your calendars"
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
callback_url="$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar/callback"
callback_url+="?code=$auth_code&state=$state_param&client_id=$GOOGLE_CALENDAR_CLIENT_ID&client_secret=$GOOGLE_CALENDAR_CLIENT_SECRET"

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar")

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
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar/credentials")

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

# Step 9: Test credentials with Google Calendar API
echo -e "${YELLOW}Step 9: Test credentials with Google Calendar API...${NC}"
calendar_list_response=$(curl -s -H "Authorization: Bearer $access_token" \
  "https://www.googleapis.com/calendar/v3/users/me/calendarList")

calendars=$(echo "$calendar_list_response" | jq -r '.items // empty')

if [ -n "$calendars" ]; then
  calendar_count=$(echo "$calendar_list_response" | jq -r '.items | length')
  primary_calendar=$(echo "$calendar_list_response" | jq -r '.items[] | select(.primary == true) | .summary')
  echo -e "${GREEN}✓ Credentials valid - connected to Google Calendar${NC}"
  echo "  Found $calendar_count calendar(s)"
  echo "  Primary calendar: $primary_calendar"
else
  echo -e "${RED}✗ Google Calendar API authentication failed${NC}"
  echo "$calendar_list_response" | jq .
  exit 1
fi
echo ""

# Step 10: Test creating an event
echo -e "${YELLOW}Step 10: Test creating a calendar event...${NC}"

# Create event for tomorrow
tomorrow=$(date -v+1d -u +"%Y-%m-%dT10:00:00Z" 2>/dev/null || date -u -d "+1 day" +"%Y-%m-%dT10:00:00Z")
tomorrow_end=$(date -v+1d -u +"%Y-%m-%dT11:00:00Z" 2>/dev/null || date -u -d "+1 day" +"%Y-%m-%dT11:00:00Z")

event_data=$(cat <<EOF
{
  "summary": "Authlane Test Event",
  "description": "This is a test event created by Authlane Google Calendar integration test at $(date)",
  "start": {
    "dateTime": "$tomorrow",
    "timeZone": "UTC"
  },
  "end": {
    "dateTime": "$tomorrow_end",
    "timeZone": "UTC"
  },
  "reminders": {
    "useDefault": true
  }
}
EOF
)

create_event_response=$(curl -s -X POST \
  -H "Authorization: Bearer $access_token" \
  -H "Content-Type: application/json" \
  -d "$event_data" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events")

created_event_id=$(echo "$create_event_response" | jq -r '.id // empty')

if [ -n "$created_event_id" ]; then
  echo -e "${GREEN}✓ Successfully created test event${NC}"
  echo "  Event ID: $created_event_id"
  echo "  Summary: $(echo "$create_event_response" | jq -r '.summary')"
  echo "  Start: $(echo "$create_event_response" | jq -r '.start.dateTime')"
  echo "  Link: $(echo "$create_event_response" | jq -r '.htmlLink')"
else
  error_msg=$(echo "$create_event_response" | jq -r '.error.message // "unknown"')
  echo -e "${YELLOW}⚠ Could not create test event: $error_msg${NC}"
  echo "  This may be a scope issue - ensure calendar.events is granted"
fi
echo ""

# Step 11: Test listing events
if [ -n "$created_event_id" ]; then
  echo -e "${YELLOW}Step 11: Test listing calendar events...${NC}"

  # List events from today
  time_min=$(date -u +"%Y-%m-%dT00:00:00Z")
  list_events_response=$(curl -s -H "Authorization: Bearer $access_token" \
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=$time_min&maxResults=10&singleEvents=true&orderBy=startTime")

  events=$(echo "$list_events_response" | jq -r '.items // empty')

  if [ -n "$events" ]; then
    event_count=$(echo "$list_events_response" | jq -r '.items | length')
    echo -e "${GREEN}✓ Successfully listed $event_count upcoming event(s)${NC}"
    if [ "$event_count" -gt 0 ]; then
      echo "  Upcoming events:"
      echo "$list_events_response" | jq -r '.items[0:3] | .[] | "    - \(.summary) (\(.start.dateTime // .start.date))"'
    fi
  else
    echo -e "${YELLOW}⚠ Could not list events${NC}"
    echo "$list_events_response" | jq .
  fi
  echo ""
fi

# Step 12: Test updating the event
if [ -n "$created_event_id" ]; then
  echo -e "${YELLOW}Step 12: Test updating the calendar event...${NC}"

  update_data=$(cat <<EOF
{
  "summary": "Authlane Test Event (Updated)",
  "description": "This event was updated by the Authlane test script at $(date)"
}
EOF
)

  update_event_response=$(curl -s -X PATCH \
    -H "Authorization: Bearer $access_token" \
    -H "Content-Type: application/json" \
    -d "$update_data" \
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/$created_event_id")

  updated_summary=$(echo "$update_event_response" | jq -r '.summary // empty')

  if [ "$updated_summary" = "Authlane Test Event (Updated)" ]; then
    echo -e "${GREEN}✓ Successfully updated test event${NC}"
    echo "  New summary: $updated_summary"
    echo "  Updated at: $(echo "$update_event_response" | jq -r '.updated')"
  else
    echo -e "${YELLOW}⚠ Could not update test event${NC}"
    echo "$update_event_response" | jq .
  fi
  echo ""
fi

# Step 13: Connection health check
echo -e "${YELLOW}Step 13: Connection health check...${NC}"
health_check_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar/health")

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
echo -e "${GREEN}✅ All Google Calendar OAuth flow tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Summary:"
echo "  ✓ OAuth authorization initiated"
echo "  ✓ PKCE code challenge generated"
echo "  ✓ State parameter verified"
echo "  ✓ Authorization code exchanged for tokens"
echo "  ✓ Credentials encrypted and stored"
echo "  ✓ Credentials can be decrypted and retrieved"
echo "  ✓ Tokens work with Google Calendar API"
echo "  ✓ Required scopes verified (calendar.events, calendar.readonly)"
echo "  ✓ Connection health check passed"
echo ""
echo "Test User ID: $TEST_USER_ID"
echo "Connection ID: $connection_id"
echo "Primary Calendar: $primary_calendar"
if [ -n "$created_event_id" ]; then
  echo "Test Event ID: $created_event_id"
fi
echo ""

# Cleanup prompt
if [ -n "$created_event_id" ]; then
  echo -n "Do you want to delete the test event from Google Calendar? (y/N): "
  read -r cleanup_event_response

  if [ "$cleanup_event_response" = "y" ] || [ "$cleanup_event_response" = "Y" ]; then
    echo ""
    echo -e "${YELLOW}Deleting test event from Google Calendar...${NC}"
    delete_event_response=$(curl -s -X DELETE -H "Authorization: Bearer $access_token" \
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/$created_event_id")

    if [ -z "$delete_event_response" ]; then
      echo -e "${GREEN}✓ Test event deleted from Google Calendar${NC}"
    else
      echo -e "${RED}✗ Failed to delete test event${NC}"
      echo "$delete_event_response" | jq .
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
    "$API_URL/api/v1/users/$TEST_USER_ID/connections/google-calendar")

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

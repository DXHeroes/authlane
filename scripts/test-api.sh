#!/bin/bash
# Test script for Authlane API
# Requires: API running on localhost:3000, valid API key in API_KEY env var

set -e

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "❌ API_KEY environment variable is required"
  echo "   Get it from: pnpm --filter @authlane/database seed"
  exit 1
fi

echo "🧪 Testing Authlane API..."
echo ""

# Health check
echo "1. Health check..."
curl -s "$API_URL/health" | jq .
echo ""

# List services
echo "2. List services..."
curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services" | jq .
echo ""

# Get GitHub service
echo "3. Get GitHub service..."
curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/services/github" | jq .
echo ""

# List connections (should be empty initially)
echo "4. List connections for user_123..."
curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/user_123/connections" | jq .
echo ""

# Get tools (should be empty if no connections)
echo "5. Get tools (MCP format)..."
curl -s -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/v1/users/user_123/tools?format=mcp" | jq .
echo ""

echo "✅ API tests completed!"


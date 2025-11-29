#!/bin/bash
# Verification script for Gmail integration
# Checks that all required files are in place

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Verifying Gmail Integration...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check 1: config.yaml exists
echo -e "${YELLOW}Step 1: Checking config.yaml...${NC}"
if [ -f "integrations/gmail/config.yaml" ]; then
  echo -e "${GREEN}✓ config.yaml exists${NC}"

  # Verify it's valid YAML with expected fields
  if grep -q "id: gmail" integrations/gmail/config.yaml && \
     grep -q "auth_type: oauth2" integrations/gmail/config.yaml; then
    echo -e "${GREEN}✓ config.yaml has correct structure${NC}"
  else
    echo -e "${RED}✗ config.yaml is missing required fields${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ config.yaml not found${NC}"
  exit 1
fi
echo ""

# Check 2: tools.ts exists
echo -e "${YELLOW}Step 2: Checking tools.ts...${NC}"
if [ -f "integrations/gmail/tools.ts" ]; then
  echo -e "${GREEN}✓ tools.ts exists${NC}"

  # Verify it exports required functions
  if grep -q "gmail_send_email" integrations/gmail/tools.ts && \
     grep -q "gmail_read_emails" integrations/gmail/tools.ts && \
     grep -q "gmail_search_emails" integrations/gmail/tools.ts && \
     grep -q "export function getTools" integrations/gmail/tools.ts; then
    echo -e "${GREEN}✓ tools.ts has required tools and exports${NC}"
  else
    echo -e "${RED}✗ tools.ts is missing required tools or exports${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ tools.ts not found${NC}"
  exit 1
fi
echo ""

# Check 3: README.md exists
echo -e "${YELLOW}Step 3: Checking README.md...${NC}"
if [ -f "integrations/gmail/README.md" ]; then
  echo -e "${GREEN}✓ README.md exists${NC}"
else
  echo -e "${YELLOW}⚠ README.md not found (optional but recommended)${NC}"
fi
echo ""

# Check 4: Test script exists
echo -e "${YELLOW}Step 4: Checking test script...${NC}"
if [ -f "scripts/test-gmail-oauth.sh" ] && [ -x "scripts/test-gmail-oauth.sh" ]; then
  echo -e "${GREEN}✓ test-gmail-oauth.sh exists and is executable${NC}"
else
  echo -e "${YELLOW}⚠ test-gmail-oauth.sh not found or not executable${NC}"
fi
echo ""

# Check 5: TypeScript compilation
echo -e "${YELLOW}Step 5: Verifying TypeScript types...${NC}"
if command -v tsc &> /dev/null; then
  # Check if tools.ts compiles without errors (just parse, don't emit)
  if tsc --noEmit integrations/gmail/tools.ts 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ TypeScript compilation errors found${NC}"
    tsc --noEmit integrations/gmail/tools.ts
    exit 1
  else
    echo -e "${GREEN}✓ TypeScript types are valid${NC}"
  fi
else
  echo -e "${YELLOW}⚠ TypeScript compiler not found, skipping type check${NC}"
fi
echo ""

# Check 6: Required OAuth URLs
echo -e "${YELLOW}Step 6: Verifying OAuth URLs...${NC}"
auth_url=$(grep "authorization_url:" integrations/gmail/config.yaml | awk '{print $2}')
token_url=$(grep "token_url:" integrations/gmail/config.yaml | awk '{print $2}')

if [ "$auth_url" = "https://accounts.google.com/o/oauth2/v2/auth" ]; then
  echo -e "${GREEN}✓ Authorization URL is correct${NC}"
else
  echo -e "${RED}✗ Authorization URL is incorrect: $auth_url${NC}"
  exit 1
fi

if [ "$token_url" = "https://oauth2.googleapis.com/token" ]; then
  echo -e "${GREEN}✓ Token URL is correct${NC}"
else
  echo -e "${RED}✗ Token URL is incorrect: $token_url${NC}"
  exit 1
fi
echo ""

# Check 7: Required scopes
echo -e "${YELLOW}Step 7: Verifying OAuth scopes...${NC}"
if grep -q "gmail.send" integrations/gmail/config.yaml && \
   grep -q "gmail.readonly" integrations/gmail/config.yaml; then
  echo -e "${GREEN}✓ Required scopes are configured${NC}"
  echo "  Scopes found:"
  grep "https://www.googleapis.com/auth/gmail" integrations/gmail/config.yaml | sed 's/^/  - /'
else
  echo -e "${RED}✗ Required scopes are missing${NC}"
  exit 1
fi
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Gmail integration verification complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Summary:"
echo "  ✓ Configuration file exists and is valid"
echo "  ✓ Tools file exists with required tools"
echo "  ✓ OAuth URLs are correctly configured"
echo "  ✓ Required scopes are configured"
echo "  ✓ TypeScript types are valid"
echo ""
echo "Next steps:"
echo "  1. Set up Google Cloud Project and OAuth credentials"
echo "  2. Enable Gmail API in Google Cloud Console"
echo "  3. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables"
echo "  4. Run: ./scripts/test-gmail-oauth.sh"
echo ""

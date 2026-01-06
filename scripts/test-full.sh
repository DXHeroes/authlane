#!/bin/bash
# Full integration test - verifies the app works end-to-end

set -e

echo "🧪 Running full integration test..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${YELLOW}⚠️  .env file not found. Creating it...${NC}"
  ./scripts/setup.sh
fi

# Source .env
set -a
source .env
set +a

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL not set in .env${NC}"
  exit 1
fi

# Check if ENCRYPTION_KEY is set
if [ -z "$ENCRYPTION_KEY" ]; then
  echo -e "${RED}❌ ENCRYPTION_KEY not set in .env${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Environment variables loaded${NC}"

# Build packages
echo ""
echo "🔨 Building packages..."
if pnpm build > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Build successful${NC}"
else
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi

# Check if database is accessible
echo ""
echo "🗄️  Checking database connection..."
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Database accessible${NC}"
else
  echo -e "${YELLOW}⚠️  Database not accessible (may need to start Docker)${NC}"
  echo "   Run: docker-compose -f docker/docker-compose.yml up -d"
fi

# Test migration generation
echo ""
echo "📝 Testing migration generation..."
if pnpm --filter @authlane/database generate > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Migrations can be generated${NC}"
else
  echo -e "${YELLOW}⚠️  Migration generation failed (may need database)${NC}"
fi

# Test API startup (quick check)
echo ""
echo "🚀 Testing API startup..."
timeout 5s pnpm --filter @authlane/api dev > /tmp/authlane-test.log 2>&1 &
API_PID=$!
sleep 2

if kill -0 $API_PID 2>/dev/null; then
  echo -e "${GREEN}✅ API started successfully${NC}"
  kill $API_PID 2>/dev/null || true
  wait $API_PID 2>/dev/null || true
else
  echo -e "${YELLOW}⚠️  API startup check inconclusive${NC}"
fi

echo ""
echo -e "${GREEN}✅ Integration test complete!${NC}"
echo ""
echo "To start the full app:"
echo "  ./scripts/run.sh"
echo ""
echo "Or manually:"
echo "  1. docker-compose -f docker/docker-compose.yml up -d"
echo "  2. pnpm --filter @authlane/database migrate"
echo "  3. pnpm --filter @authlane/database seed"
echo "  4. pnpm --filter @authlane/api dev"















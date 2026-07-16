#!/bin/bash
# Verification script - checks if Authlane is properly set up

set -e

echo "🔍 Verifying Authlane setup..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  echo "   Run: ./scripts/setup.sh"
  exit 1
fi
echo "✅ .env file exists"

for KEYRING_NAME in AUTHLANE_DATA_KEK_RING AUTHLANE_LOOKUP_KEY_RING AUTHLANE_REDIS_KEY_RING; do
  if ! grep -q "^${KEYRING_NAME}=" .env || grep -q "^${KEYRING_NAME}=$" .env; then
    echo "❌ ${KEYRING_NAME} not set in .env"
    echo "   Run: ./scripts/setup.sh"
    exit 1
  fi
done
echo "✅ Versioned Authlane keyrings are set"

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL=" .env || grep -q "DATABASE_URL=$" .env; then
  echo "❌ DATABASE_URL not set in .env"
  exit 1
fi
echo "✅ DATABASE_URL is set"

# Check if packages are built
if [ ! -d "packages/database/dist" ] || [ ! -d "packages/shared/dist" ] || [ ! -d "packages/crypto/dist" ]; then
  echo "⚠️  Packages not built, building now..."
  pnpm build
fi
echo "✅ Packages are built"

# Check if migrations directory exists
if [ ! -d "packages/database/drizzle" ]; then
  echo "⚠️  Migrations not generated yet"
  echo "   Run: pnpm --filter @authlane/database generate"
else
  echo "✅ Migrations directory exists"
fi

echo ""
echo "✅ Setup verification complete!"
echo ""
echo "Next steps:"
echo "1. Start database: docker-compose -f docker/docker-compose.yml up -d"
echo "2. Run migrations: pnpm --filter @authlane/database migrate"
echo "3. Seed database: pnpm --filter @authlane/database seed"
echo "4. Start API: pnpm --filter @authlane/api dev"














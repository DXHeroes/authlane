#!/bin/bash
# Setup script for Authlane
# Generates versioned keyrings, runs migrations, and seeds database

set -e

echo "🚀 Setting up Authlane..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env 2>/dev/null || echo "⚠️  .env.example not found, creating basic .env"
  echo "DATABASE_URL=postgresql://user:password@localhost:5432/authlane" >> .env
  echo "✅ .env file created"
fi

KEY_ID="dev-$(date +%Y%m%d)"
for KEYRING_NAME in AUTHLANE_DATA_KEK_RING AUTHLANE_LOOKUP_KEY_RING AUTHLANE_REDIS_KEY_RING; do
  if ! grep -q "^${KEYRING_NAME}=" .env || grep -q "^${KEYRING_NAME}=$" .env; then
    echo "🔑 Generating ${KEYRING_NAME}..."
    KEYRING_VALUE="${KEY_ID}:$(openssl rand -hex 32)"
    if grep -q "^${KEYRING_NAME}=" .env; then
      sed -i.bak "s/^${KEYRING_NAME}=.*/${KEYRING_NAME}=${KEYRING_VALUE}/" .env
    else
      echo "${KEYRING_NAME}=${KEYRING_VALUE}" >> .env
    fi
  fi
done
echo "✅ Versioned Authlane keyrings are configured"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build packages
echo "🔨 Building packages..."
pnpm build

# Generate migrations
echo "🗄️  Generating database migrations..."
pnpm --filter @authlane/database generate

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your database connection string"
echo "2. Run migrations: pnpm --filter @authlane/database migrate"
echo "3. Seed database: pnpm --filter @authlane/database seed"
echo "4. Start API: pnpm --filter @authlane/api dev"














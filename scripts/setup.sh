#!/bin/bash
# Setup script for Authlane
# Generates encryption key, runs migrations, and seeds database

set -e

echo "🚀 Setting up Authlane..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env 2>/dev/null || echo "⚠️  .env.example not found, creating basic .env"
  echo "DATABASE_URL=postgresql://user:password@localhost:5432/authlane" >> .env
  echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
  echo "✅ .env file created"
fi

# Generate encryption key if not set
if ! grep -q "ENCRYPTION_KEY=" .env || grep -q "ENCRYPTION_KEY=$" .env; then
  echo "🔑 Generating encryption key..."
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  if grep -q "ENCRYPTION_KEY=" .env; then
    sed -i.bak "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
  else
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
  fi
  echo "✅ Encryption key generated"
fi

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









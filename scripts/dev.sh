#!/bin/bash
# Development script - starts database and API

set -e

echo "🚀 Starting Authlane development environment..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env 2>/dev/null || true
  
  # Generate encryption key
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
  echo "✅ Generated encryption key"
fi

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL=" .env || grep -q "DATABASE_URL=$" .env; then
  echo "📝 Setting default DATABASE_URL..."
  if grep -q "DATABASE_URL=" .env; then
    sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=postgresql://authlane:authlane@localhost:5432/authlane|" .env
  else
    echo "DATABASE_URL=postgresql://authlane:authlane@localhost:5432/authlane" >> .env
  fi
fi

# Start Docker services if docker-compose exists
if [ -f docker/docker-compose.yml ]; then
  echo "🐳 Starting Docker services..."
  docker-compose -f docker/docker-compose.yml up -d
  
  echo "⏳ Waiting for PostgreSQL to be ready..."
  sleep 5
fi

# Build packages
echo "🔨 Building packages..."
pnpm build

# Check if migrations need to be run
echo "🗄️  Checking database migrations..."
if ! pnpm --filter @authlane/database migrate 2>/dev/null; then
  echo "📦 Generating migrations..."
  pnpm --filter @authlane/database generate || true
  echo "⚠️  Please run migrations manually: pnpm --filter @authlane/database migrate"
fi

echo ""
echo "✅ Development environment ready!"
echo ""
echo "Next steps:"
echo "1. Run migrations: pnpm --filter @authlane/database migrate"
echo "2. Seed database: pnpm --filter @authlane/database seed"
echo "3. Start API: pnpm --filter @authlane/api dev"
echo ""















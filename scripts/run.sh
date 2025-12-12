#!/bin/bash
# Complete run script - sets up and starts Authlane

set -e

echo "🚀 Starting Authlane..."
echo ""

# Check prerequisites
if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm is not installed"
  echo "   Install: npm install -g pnpm"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "⚠️  Docker not found - you'll need to set up PostgreSQL manually"
else
  echo "✅ Docker found"
fi

# Run setup if needed
if [ ! -f .env ]; then
  echo "📝 Running initial setup..."
  ./scripts/setup.sh
fi

# Verify setup
./scripts/verify.sh

# Start database if Docker is available
if command -v docker &> /dev/null && [ -f docker/docker-compose.yml ]; then
  echo ""
  echo "🐳 Starting Docker services..."
  docker-compose -f docker/docker-compose.yml up -d
  echo "⏳ Waiting for PostgreSQL..."
  sleep 5
fi

# Build if needed
if [ ! -d "packages/database/dist" ]; then
  echo ""
  echo "🔨 Building packages..."
  pnpm build
fi

# Run migrations
echo ""
echo "🗄️  Running migrations..."
if pnpm --filter @authlane/database migrate 2>/dev/null; then
  echo "✅ Migrations completed"
else
  echo "⚠️  Migrations failed or database not ready"
  echo "   Make sure PostgreSQL is running and DATABASE_URL is correct"
fi

# Seed database
echo ""
echo "🌱 Seeding database..."
if pnpm --filter @authlane/database seed 2>/dev/null; then
  echo "✅ Database seeded"
else
  echo "⚠️  Seed failed (may already be seeded)"
fi

# Start API
echo ""
echo "🚀 Starting API server..."
echo "   API will be available at: http://localhost:3000"
echo "   Health check: http://localhost:3000/health"
echo ""
pnpm --filter @authlane/api dev









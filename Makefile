.PHONY: setup build dev test lint migrate seed clean verify run

# Quick setup
setup:
	@./scripts/setup.sh

# Build all packages
build:
	@pnpm build

# Start development
dev:
	@pnpm --filter @authlane/api dev

# Run tests
test:
	@pnpm test

# Lint code
lint:
	@pnpm lint

# Fix linting issues
lint-fix:
	@pnpm lint:fix

# Generate migrations
migrate-gen:
	@pnpm --filter @authlane/database generate

# Run migrations
migrate:
	@pnpm --filter @authlane/database migrate

# Seed database
seed:
	@pnpm --filter @authlane/database seed

# Clean build artifacts
clean:
	@pnpm clean

# Verify setup
verify:
	@./scripts/verify.sh

# Run everything (setup + start)
run:
	@./scripts/run.sh

# Start database
db-up:
	@docker-compose -f docker/docker-compose.yml up -d

# Stop database
db-down:
	@docker-compose -f docker/docker-compose.yml down

# Full setup and start
all: setup db-up migrate seed dev









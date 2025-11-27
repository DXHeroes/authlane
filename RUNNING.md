# 🚀 Running Authlane

## Quick Start (One Command)

```bash
./scripts/run.sh
```

This script will:
1. ✅ Check prerequisites
2. ✅ Set up environment
3. ✅ Start Docker services
4. ✅ Build packages
5. ✅ Run migrations
6. ✅ Seed database
7. ✅ Start API server

## Manual Steps

### 1. Setup Environment

```bash
./scripts/setup.sh
```

### 2. Start Database

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### 3. Initialize Database

```bash
# Generate migrations
pnpm --filter @authlane/database generate

# Run migrations
pnpm --filter @authlane/database migrate

# Seed database (creates test tenant and services)
pnpm --filter @authlane/database seed
```

**Save the API key from the seed output!**

### 4. Start API

```bash
pnpm --filter @authlane/api dev
```

The API will start on `http://localhost:3000`

## Verify It's Working

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-..."
}
```

### List Services

```bash
# Replace YOUR_API_KEY with the key from seed output
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/services
```

Expected response:
```json
{
  "data": [
    {
      "id": "github",
      "name": "GitHub",
      "authType": "oauth2",
      ...
    }
  ],
  "error": null
}
```

## Common Issues

### Database Connection Failed

**Problem**: `❌ Database connection failed`

**Solutions**:
1. Check PostgreSQL is running: `docker ps`
2. Verify DATABASE_URL in `.env`
3. Try: `docker-compose -f docker/docker-compose.yml restart`

### Migrations Fail

**Problem**: `Migration failed: relation does not exist`

**Solutions**:
1. Create database: `createdb authlane` (if using local PostgreSQL)
2. Or use Docker: `docker-compose -f docker/docker-compose.yml up -d`
3. Check DATABASE_URL is correct

### API Won't Start

**Problem**: `Environment validation failed`

**Solutions**:
1. Check ENCRYPTION_KEY is set (64 hex characters)
2. Run: `openssl rand -hex 32` and add to `.env`
3. Verify all required env vars in `.env`

### Port Already in Use

**Problem**: `EADDRINUSE: address already in use`

**Solutions**:
1. Change API_PORT in `.env`
2. Or kill process on port 3000: `lsof -ti:3000 | xargs kill`

## Testing the Full Flow

### 1. Get API Key

From seed output:
```
📝 Test API Key: test_api_key_1234567890
```

### 2. List Services

```bash
export API_KEY="test_api_key_1234567890"

curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/v1/services
```

### 3. Start OAuth Flow

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/authorize?client_id=YOUR_GITHUB_CLIENT_ID&redirect_uri=http://localhost:3000/callback"
```

This returns an `authorization_url` - open it in a browser to complete OAuth.

### 4. Get Connections

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/v1/users/user_123/connections
```

### 5. Get Tools

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/tools?format=mcp"
```

## Production Deployment

For production:

1. Set `NODE_ENV=production` in `.env`
2. Use a proper PostgreSQL instance
3. Set strong ENCRYPTION_KEY (keep it secret!)
4. Configure proper CORS_ORIGIN
5. Set up reverse proxy (nginx, etc.)
6. Enable rate limiting
7. Set up monitoring

---

**Need help?** Check [QUICKSTART.md](./QUICKSTART.md) or [IMPLEMENTATION.md](./IMPLEMENTATION.md)


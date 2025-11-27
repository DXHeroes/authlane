# 🚀 Authlane - Start Here

Welcome! This guide will get you up and running in **5 minutes**.

## Quick Start (3 commands)

```bash
# 1. Setup everything
./scripts/setup.sh

# 2. Start database (Docker)
docker-compose -f docker/docker-compose.yml up -d

# 3. Initialize database
pnpm --filter @authlane/database migrate && pnpm --filter @authlane/database seed
```

Then start the API:

```bash
pnpm --filter @authlane/api dev
```

## What You Get

✅ **Full REST API** running on `http://localhost:3000`
✅ **OAuth2 flow** with PKCE
✅ **GitHub integration** example
✅ **Encrypted credential storage**
✅ **API key authentication**

## Test It

After seeding, you'll get an API key. Test the API:

```bash
# Get your API key from seed output, then:
export API_KEY="your_api_key_here"

# Health check
curl http://localhost:3000/health

# List services
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/v1/services
```

## Next Steps

1. **Read [QUICKSTART.md](./QUICKSTART.md)** for detailed setup
2. **Read [IMPLEMENTATION.md](./IMPLEMENTATION.md)** to see what's implemented
3. **Read [AGENTS.md](./AGENTS.md)** for development context

## Troubleshooting

**Database connection issues?**
- Make sure PostgreSQL is running: `docker ps`
- Check DATABASE_URL in `.env`

**API won't start?**
- Check ENCRYPTION_KEY is set (64 hex chars)
- Run `pnpm build` first

**Migrations failing?**
- Make sure database exists
- Check DATABASE_URL is correct
- Try: `pnpm --filter @authlane/database generate` first

---

**Ready to build?** Start with `./scripts/setup.sh` 🎉


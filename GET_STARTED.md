# 🚀 Get Started with Authlane

## Quick Start (3 Commands)

```bash
# 1. Setup everything
./scripts/setup.sh

# 2. Start database and initialize
docker-compose -f docker/docker-compose.yml up -d
pnpm --filter @authlane/database migrate && pnpm --filter @authlane/database seed

# 3. Start API
pnpm --filter @authlane/api dev
```

**That's it!** Your API is running on `http://localhost:3000`

## Or Use the All-in-One Script

```bash
./scripts/run.sh
```

This does everything automatically.

## Test It Works

```bash
# Health check (no auth needed)
curl http://localhost:3000/health

# List services (use API key from seed output)
export API_KEY="your_api_key_from_seed_output"
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/v1/services
```

## What You Get

✅ **Full REST API** - All endpoints working
✅ **OAuth2 Flow** - Complete with PKCE
✅ **GitHub Integration** - Example integration
✅ **Encrypted Storage** - Credentials are secure
✅ **API Authentication** - API key based

## Next Steps

1. **Read [RUNNING.md](./RUNNING.md)** - Detailed running guide
2. **Read [FEATURES.md](./FEATURES.md)** - See all features
3. **Read [COMPLETE.md](./COMPLETE.md)** - Full status

## Need Help?

- Check [QUICKSTART.md](./QUICKSTART.md) for detailed setup
- Check [IMPLEMENTATION.md](./IMPLEMENTATION.md) for architecture
- Check [AGENTS.md](./AGENTS.md) for development context

---

**🎉 Ready to go!** Start with `./scripts/run.sh`


# Authlane

**Open-source platform for managing third-party integrations in AI agents and SaaS applications**

[![Status](https://img.shields.io/badge/status-ready-green)]()
[![Build](https://img.shields.io/badge/build-passing-green)]()
[![License](https://img.shields.io/badge/license-Elastic--2.0-blue)]()

## 🚀 Quick Start

```bash
# One command to start everything
./scripts/run.sh
```

That's it! Your API will be running on `http://localhost:3000`

## 📖 Documentation

- **[GET_STARTED.md](./GET_STARTED.md)** - Quick start guide
- **[RUNNING.md](./RUNNING.md)** - Detailed running instructions
- **[VERIFICATION.md](./VERIFICATION.md)** - Verification checklist
- **[COMPLETE.md](./COMPLETE.md)** - Full feature status
- **[AGENTS.md](./AGENTS.md)** - Development context for AI assistants

## ✨ Features

- ✅ **REST API** - Complete REST API with 11 endpoints
- ✅ **OAuth2** - Full OAuth2 flow with PKCE
- ✅ **Encryption** - AES-256-GCM credential encryption
- ✅ **Multi-tenancy** - PostgreSQL Row-Level Security
- ✅ **API Authentication** - API key based authentication
- ✅ **Tool Definitions** - MCP and OpenAI function calling formats
- ✅ **GitHub Integration** - Example integration included

## 🏗️ Architecture

- **Runtime**: Node.js 22+
- **Framework**: Hono (high-performance API framework)
- **Database**: PostgreSQL 16+ with Drizzle ORM
- **Cache**: Redis (for sessions and rate limiting)
- **Queue**: BullMQ (for token refresh)
- **Monorepo**: Turborepo + pnpm

## 📦 Project Structure

```
authlane/
├── apps/
│   └── api/              # REST API server
├── packages/
│   ├── database/         # Database schema & migrations
│   ├── shared/           # Shared types & utilities
│   ├── crypto/           # Encryption utilities
│   └── ...
├── integrations/         # Service integrations
└── scripts/              # Setup & utility scripts
```

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run linting
pnpm lint

# Start API in development
pnpm --filter @authlane/api dev
```

## 🔒 Security

- AES-256-GCM encryption for credentials
- API key hashing (SHA-256)
- OAuth2 with PKCE
- State parameter validation
- Input validation
- Row-Level Security for multi-tenancy

## 📝 License

Elastic License 2.0 (ELv2)

## 🤝 Contributing

See [AGENTS.md](./AGENTS.md) for development guidelines and architecture details.

---

**Ready to use!** Start with `./scripts/run.sh`

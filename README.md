# Authlane

<div align="center">

**Open-source OAuth infrastructure for AI agents and SaaS applications**

[![Build Status](https://github.com/authlane/authlane/workflows/CI/badge.svg)](https://github.com/authlane/authlane/actions)
[![codecov](https://codecov.io/gh/authlane/authlane/branch/main/graph/badge.svg)](https://codecov.io/gh/authlane/authlane)
[![License](https://img.shields.io/badge/license-Elastic--2.0-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)

[Website](https://authlane.com) • [Documentation](https://docs.authlane.com) • [Dashboard](https://dashboard.authlane.com) • [Discord](https://discord.gg/authlane)

![Authlane Demo](docs/assets/demo.gif)

</div>

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

### Core Features
- 🔐 **OAuth 2.0** - Full OAuth2 flow with PKCE support
- 🔄 **Auto Token Refresh** - Intelligent token refresh with retry logic
- 🔒 **Enterprise Security** - AES-256-GCM encryption, API key hashing
- 👥 **Multi-tenancy** - PostgreSQL Row-Level Security
- ⚡ **High Performance** - Redis caching, optimized queries
- 📊 **Monitoring** - Sentry error tracking, Prometheus metrics, Pino logging

### Developer Experience
- 🎯 **50+ Integrations** - GitHub, Google, Slack, Notion, Linear, Stripe, and more
- 🛠️ **REST API** - Clean, well-documented API
- 📦 **MCP Server** - Model Context Protocol integration for AI agents
- 🪝 **Webhooks** - Real-time notifications for events
- 🧪 **TypeScript SDK** - Type-safe client libraries
- 📚 **Comprehensive Docs** - Interactive documentation with examples

### Infrastructure
- 🚀 **Production Ready** - Docker, CI/CD, monitoring, logging
- 📈 **Scalable** - Horizontal scaling with load balancing
- 🔍 **Observable** - Metrics, logs, traces, and analytics
- 🛡️ **Secure** - Best practices, regular security audits
- 🌍 **Cloud Native** - Deploy to Vercel, Railway, Fly.io, or self-host

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

## 🎯 Use Cases

- **AI Agents** - Give your AI agents secure access to user data across platforms
- **SaaS Apps** - Integrate with 50+ services without managing OAuth complexity
- **Internal Tools** - Build dashboards that pull data from multiple sources
- **Automation** - Connect APIs and automate workflows
- **Data Sync** - Keep data synchronized across multiple platforms

## 🚦 Supported Integrations

<details>
<summary>View all integrations (50+)</summary>

### Development
- GitHub
- GitLab
- Linear
- Jira

### Communication
- Slack
- Discord
- Microsoft Teams
- Zoom

### Productivity
- Notion
- Google Calendar
- Google Drive
- Gmail
- Airtable

### CRM & Sales
- HubSpot
- Salesforce
- Pipedrive

### Payment
- Stripe
- PayPal

### Monitoring
- Sentry
- Datadog

_...and 30+ more integrations_

</details>

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Start API in development
pnpm --filter @authlane/api dev

# Start dashboard
pnpm --filter @authlane/dashboard dev

# Run database migrations
pnpm --filter @authlane/database db:push
```

## 🐳 Deployment

### Docker Compose (easiest)
```bash
docker-compose up -d
```

### Cloud Platforms
- **Vercel**: `vercel deploy`
- **Railway**: `railway up`
- **Fly.io**: `fly deploy`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 📊 Monitoring & Observability

- **Error Tracking**: Sentry integration
- **Metrics**: Prometheus + Grafana dashboards
- **Logging**: Structured JSON logs with Pino
- **Health Checks**: `/health` and `/metrics` endpoints

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

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [AGENTS.md](./AGENTS.md) for development guidelines and architecture details.

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=authlane/authlane&type=Date)](https://star-history.com/#authlane/authlane&Date)

## 💬 Community & Support

- [Discord](https://discord.gg/authlane) - Chat with the community
- [GitHub Discussions](https://github.com/authlane/authlane/discussions) - Ask questions and share ideas
- [Twitter](https://twitter.com/authlane) - Follow for updates
- [Email](mailto:support@authlane.com) - Direct support

## 📄 License

Elastic License 2.0 (ELv2) - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:
- [Hono](https://hono.dev/) - Fast web framework
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [BullMQ](https://bullmq.io/) - Queue processing
- [Sentry](https://sentry.io/) - Error tracking
- [Prometheus](https://prometheus.io/) - Metrics

---

<div align="center">

**Ready to simplify your OAuth?**

[Get Started](https://docs.authlane.com) • [View Demo](https://authlane.com) • [Join Discord](https://discord.gg/authlane)

Made with ❤️ by the Authlane team

</div>

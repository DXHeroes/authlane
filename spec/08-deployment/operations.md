# Operations Guide

Monitoring, maintenance, and scaling Authlane in production.

## Monitoring

### Health Checks

Authlane provides health check endpoints:

```bash
# Basic health
curl http://localhost:3000/health
# Response: { "status": "ok", "timestamp": "2025-01-15T10:00:00Z" }

# Detailed health (requires API key)
curl -H "X-API-Key: $API_KEY" http://localhost:3000/health/detailed
# Response: {
#   "status": "ok",
#   "database": "connected",
#   "redis": "connected",
#   "uptime": 86400
# }
```

### Metrics

Authlane exposes Prometheus metrics at `/metrics`:

```
# API metrics
authlane_http_requests_total{method="GET",path="/v1/services",status="200"} 1234
authlane_http_request_duration_seconds{method="GET",path="/v1/services"}

# Connection metrics
authlane_connections_total{service="github",status="connected"} 567
authlane_oauth_flows_total{service="github",result="success"} 890

# Tool metrics
authlane_tool_executions_total{tool="github_create_issue",result="success"} 123
```

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'authlane'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'
    scheme: http
```

### Grafana Dashboard

Import the Authlane dashboard (ID: TBD) or create custom panels:

```json
{
  "panels": [
    {
      "title": "Request Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(authlane_http_requests_total[5m])"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(authlane_http_requests_total{status=~\"5..\"}[5m])"
        }
      ]
    }
  ]
}
```

## Logging

### Log Levels

Configure with `LOG_LEVEL` environment variable:

| Level | Description |
|-------|-------------|
| `error` | Errors only |
| `warn` | Warnings and errors |
| `info` | General information (default) |
| `debug` | Detailed debugging |

### Log Format

```json
{
  "level": "info",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "requestId": "abc123",
  "message": "Request completed",
  "method": "GET",
  "path": "/v1/services",
  "status": 200,
  "duration": 45
}
```

### Log Aggregation

#### Loki (with Grafana)

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - /var/log:/var/log
      - ./promtail-config.yaml:/etc/promtail/config.yaml
    command: -config.file=/etc/promtail/config.yaml
```

#### CloudWatch (AWS)

```json
{
  "containerDefinitions": [{
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/authlane/api",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "api"
      }
    }
  }]
}
```

## Alerting

### Critical Alerts

Configure alerts for:

1. **Service Down**: Health check failures
2. **High Error Rate**: >1% 5xx errors
3. **High Latency**: p99 >1s
4. **Database Issues**: Connection failures
5. **Token Refresh Failures**: OAuth tokens not refreshing

### Prometheus Alerting Rules

```yaml
groups:
  - name: authlane
    rules:
      - alert: HighErrorRate
        expr: rate(authlane_http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(authlane_http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"

      - alert: DatabaseConnectionFailed
        expr: authlane_database_connected == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database connection lost"
```

## Backup and Recovery

### Database Backup

#### Automated Backups

```bash
#!/bin/bash
# backup.sh - Run daily via cron

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups

# Backup database
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/db_$DATE.sql.gz s3://my-bucket/backups/
```

#### Point-in-Time Recovery (AWS RDS)

1. Enable automated backups
2. Enable point-in-time recovery
3. Restore to any point within retention period

### Encryption Key Backup

**Critical**: The encryption key is required to decrypt stored credentials.

1. Store in secure secret manager (AWS Secrets Manager, Vault)
2. Keep encrypted backup in separate location
3. Document recovery procedure

### Recovery Procedure

1. Restore database from backup
2. Ensure encryption key is correct
3. Start services
4. Run health checks
5. Verify connections work

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.prod.yml
services:
  api:
    deploy:
      replicas: 3
```

### Load Balancing

Authlane is stateless and can be load-balanced:

```nginx
upstream authlane {
    least_conn;
    server api1:3000;
    server api2:3000;
    server api3:3000;
}
```

### Database Scaling

1. **Connection Pooling**: Use PgBouncer
   ```
   DATABASE_URL=postgresql://user:pass@pgbouncer:6432/authlane
   ```

2. **Read Replicas**: For read-heavy workloads
   ```typescript
   const readDb = new Database(process.env.DATABASE_READ_URL);
   const writeDb = new Database(process.env.DATABASE_URL);
   ```

3. **Managed Databases**: Consider RDS, Cloud SQL for automatic scaling

### Redis Scaling

1. **Redis Cluster**: For high availability
2. **Managed Redis**: ElastiCache, Upstash, etc.

## Maintenance

### Database Migrations

```bash
# Check pending migrations
docker compose exec api pnpm db:status

# Run migrations
docker compose exec api pnpm db:migrate

# Rollback (if needed)
docker compose exec api pnpm db:rollback
```

### Updating Authlane

1. Review changelog for breaking changes
2. Backup database
3. Pull new version
4. Run migrations
5. Deploy with rolling update
6. Monitor for issues

### Token Cleanup

Expired tokens are cleaned automatically, but you can trigger manually:

```bash
docker compose exec api pnpm cleanup:tokens
```

## Security Operations

### Rotate Encryption Key

**Warning**: This re-encrypts all credentials. Plan for downtime.

```bash
# Generate new key
NEW_KEY=$(openssl rand -base64 32)

# Run rotation script
docker compose exec api pnpm rotate-key --new-key=$NEW_KEY

# Update environment
echo "ENCRYPTION_KEY=$NEW_KEY" >> .env

# Restart services
docker compose up -d
```

### Audit Logging (Scale+ plans)

View audit logs:

```bash
# Recent events
curl -H "X-API-Key: $ADMIN_KEY" \
  "https://api.authlane.com/v1/admin/audit-logs?limit=100"

# Filter by action
curl -H "X-API-Key: $ADMIN_KEY" \
  "https://api.authlane.com/v1/admin/audit-logs?action=connection.deleted"
```

### Security Updates

1. Monitor Authlane releases for security patches
2. Subscribe to security advisories
3. Apply critical updates within 24 hours
4. Test in staging before production

## Disaster Recovery

### Recovery Time Objective (RTO)

| Scenario | Target RTO |
|----------|-----------|
| API instance failure | < 1 minute |
| Database failover | < 5 minutes |
| Full region failure | < 1 hour |

### Recovery Point Objective (RPO)

| Data Type | Target RPO |
|-----------|-----------|
| Database | < 5 minutes |
| Connections | Zero loss |
| Logs | < 1 hour |

### DR Checklist

- [ ] Automated database backups enabled
- [ ] Backup restoration tested
- [ ] Encryption key backed up securely
- [ ] Multi-AZ deployment (if required)
- [ ] Runbooks documented
- [ ] Recovery procedures tested quarterly

## Next Steps

- [Environment Variables](./environment-variables.md)
- [Security Documentation](../04-security/index.md)
- [Troubleshooting](../07-user-guides/troubleshooting/common-issues.md)


# Cloud Platform Deployment

> Provider examples in this design document are not production-ready. Apply the launch gate in
> `docs/security/OPERATIONS.md` and its versioned keyring, role isolation, and private-network rules.

Deploy Authlane to various cloud platforms.

## Railway

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/authlane)

### Manual Deployment

1. Create new project on [railway.app](https://railway.app)

2. Add services:
   - PostgreSQL
   - Redis

3. Create new service from GitHub repo

4. Add environment variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   ENCRYPTION_KEY=<generate with: openssl rand -base64 32>
   NODE_ENV=production
   ```

5. Configure build:
   ```
   Build Command: pnpm install && pnpm build
   Start Command: pnpm start
   ```

6. Deploy

### Custom Domain

1. Go to Settings → Domains
2. Add your custom domain
3. Configure DNS:
   ```
   CNAME api.yourdomain.com railway.app
   ```

## Render

### Deploy

1. Create account on [render.com](https://render.com)

2. Create PostgreSQL database:
   - Name: `authlane-db`
   - Plan: Starter or higher

3. Create Redis instance:
   - Name: `authlane-redis`
   - Plan: Starter or higher

4. Create Web Service:
   - Connect GitHub repository
   - Environment: Node
   - Build Command: `pnpm install && pnpm build`
   - Start Command: `pnpm start`

5. Add environment variables:
   ```
   DATABASE_URL=<from PostgreSQL service>
   REDIS_URL=<from Redis service>
   ENCRYPTION_KEY=<generate>
   NODE_ENV=production
   ```

### render.yaml (Blueprint)

```yaml
services:
  - type: web
    name: authlane-api
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: authlane-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: authlane-redis
          type: redis
          property: connectionString
      - key: ENCRYPTION_KEY
        generateValue: true
      - key: NODE_ENV
        value: production

databases:
  - name: authlane-db
    plan: starter

redis:
  - name: authlane-redis
    plan: starter
```

## Fly.io

### Install CLI

```bash
curl -L https://fly.io/install.sh | sh
```

### Deploy

1. Initialize:
   ```bash
   fly launch
   ```

2. Create PostgreSQL:
   ```bash
   fly postgres create --name authlane-db
   fly postgres attach authlane-db
   ```

3. Create Redis:
   ```bash
   fly redis create --name authlane-redis
   ```

4. Set secrets:
   ```bash
   fly secrets set ENCRYPTION_KEY=$(openssl rand -base64 32)
   fly secrets set REDIS_URL=redis://default:password@authlane-redis.internal:6379
   ```

5. Deploy:
   ```bash
   fly deploy
   ```

### fly.toml

```toml
app = "authlane"

[build]
  builder = "heroku/buildpacks:20"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "1s"
    interval = "15s"
    restart_limit = 0
    timeout = "2s"
```

## AWS

### ECS with Fargate

1. Create VPC and subnets

2. Create RDS PostgreSQL:
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier authlane-db \
     --db-instance-class db.t3.micro \
     --engine postgres \
     --master-username postgres \
     --master-user-password <password> \
     --allocated-storage 20
   ```

3. Create ElastiCache Redis:
   ```bash
   aws elasticache create-cache-cluster \
     --cache-cluster-id authlane-redis \
     --cache-node-type cache.t3.micro \
     --engine redis \
     --num-cache-nodes 1
   ```

4. Create ECS cluster:
   ```bash
   aws ecs create-cluster --cluster-name authlane
   ```

5. Create task definition (task-definition.json):
   ```json
   {
     "family": "authlane",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "256",
     "memory": "512",
     "containerDefinitions": [
       {
         "name": "api",
         "image": "your-ecr-repo/authlane:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {"name": "NODE_ENV", "value": "production"}
         ],
         "secrets": [
           {"name": "DATABASE_URL", "valueFrom": "arn:aws:ssm:..."},
           {"name": "REDIS_URL", "valueFrom": "arn:aws:ssm:..."},
           {"name": "ENCRYPTION_KEY", "valueFrom": "arn:aws:ssm:..."}
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/authlane",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

6. Create service and load balancer

### AWS CDK Example

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

export class AuthlaneStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    const db = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task');
    taskDefinition.addContainer('api', {
      image: ecs.ContainerImage.fromRegistry('authlane/authlane'),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        NODE_ENV: 'production',
      },
    });

    new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2,
    });
  }
}
```

## Google Cloud

### Cloud Run

1. Build and push image:
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT_ID/authlane
   ```

2. Create Cloud SQL PostgreSQL instance

3. Create Memorystore Redis instance

4. Deploy to Cloud Run:
   ```bash
   gcloud run deploy authlane \
     --image gcr.io/PROJECT_ID/authlane \
     --platform managed \
     --region us-central1 \
     --add-cloudsql-instances PROJECT_ID:REGION:INSTANCE \
     --set-env-vars "NODE_ENV=production" \
     --set-secrets "DATABASE_URL=authlane-db-url:latest" \
     --set-secrets "REDIS_URL=authlane-redis-url:latest" \
     --set-secrets "ENCRYPTION_KEY=authlane-encryption-key:latest"
   ```

## DigitalOcean

### App Platform

1. Create app from GitHub repo

2. Configure:
   - Type: Web Service
   - Build Command: `pnpm install && pnpm build`
   - Run Command: `pnpm start`

3. Add database (PostgreSQL)

4. Add Redis (from Marketplace)

5. Set environment variables

### Droplet with Docker

```bash
# Create droplet
doctl compute droplet create authlane \
  --image docker-20-04 \
  --size s-2vcpu-4gb \
  --region nyc1

# SSH and deploy
ssh root@<droplet-ip>
git clone https://github.com/authlane/authlane.git
cd authlane
docker compose up -d
```

## Environment Variables Reference

All platforms require these variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 key |
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Server port (default: 3000) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `CORS_ORIGINS` | No | Allowed origins |

## Next Steps

- [Docker Deployment](./docker.md)
- [Operations Guide](./operations.md)
- [Security Best Practices](../04-security/index.md)

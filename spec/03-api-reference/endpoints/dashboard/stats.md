# Dashboard Stats

Retrieve usage statistics for the dashboard.

## Endpoint

```
GET /api/v1/dashboard/stats
```

## Authentication

- **Session**: Required (dashboard only)
- **API Key**: Not allowed

## Parameters

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: "day", "week", "month" (default: "month") |
| `organizationId` | string | No | Filter by organization (admin only) |

## Response

### Success (200)

```json
{
  "data": {
    "overview": {
      "totalUsers": 1250,
      "totalConnections": 3420,
      "activeConnections": 3180,
      "totalApiCalls": 45230,
      "servicesUsed": 8
    },
    "connectionsByService": [
      {
        "serviceId": "github",
        "serviceName": "GitHub",
        "count": 1100,
        "percentage": 32.2
      },
      {
        "serviceId": "slack",
        "serviceName": "Slack",
        "count": 890,
        "percentage": 26.0
      },
      {
        "serviceId": "google",
        "serviceName": "Google",
        "count": 750,
        "percentage": 21.9
      }
    ],
    "connectionsByStatus": {
      "connected": 3180,
      "expired": 180,
      "error": 60,
      "pending": 0
    },
    "apiUsage": {
      "total": 45230,
      "byEndpoint": [
        { "endpoint": "/tools/execute", "count": 22000, "percentage": 48.6 },
        { "endpoint": "/connections/credentials", "count": 15000, "percentage": 33.2 },
        { "endpoint": "/tools/list", "count": 5000, "percentage": 11.1 }
      ],
      "trend": [
        { "date": "2024-12-01", "count": 1200 },
        { "date": "2024-12-02", "count": 1450 },
        { "date": "2024-12-03", "count": 1380 }
      ]
    },
    "recentActivity": [
      {
        "type": "connection_created",
        "userId": "user_123",
        "serviceId": "github",
        "timestamp": "2024-12-12T10:30:00Z"
      },
      {
        "type": "tool_executed",
        "userId": "user_456",
        "tool": "github_create_issue",
        "timestamp": "2024-12-12T10:28:00Z"
      }
    ]
  },
  "error": null
}
```

## Examples

### cURL

```bash
# Requires session cookie
curl -b "session=xxx" \
  "https://api.authlane.com/api/v1/dashboard/stats"

# With period filter
curl -b "session=xxx" \
  "https://api.authlane.com/api/v1/dashboard/stats?period=week"
```

### TypeScript (Dashboard)

```typescript
const { data, error } = await authlane.dashboard.stats({
  period: 'month',
});

if (error) {
  console.error(error.message);
  return;
}

console.log(`Total users: ${data.overview.totalUsers}`);
console.log(`Active connections: ${data.overview.activeConnections}`);
```

### React Dashboard Component

```tsx
function DashboardStats() {
  const { data, isLoading } = useQuery(['stats'], () =>
    authlane.dashboard.stats({ period: 'month' })
  );

  if (isLoading) return <Skeleton />;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        title="Total Users"
        value={data.overview.totalUsers}
        icon={<UsersIcon />}
      />
      <StatCard
        title="Active Connections"
        value={data.overview.activeConnections}
        icon={<LinkIcon />}
      />
      <StatCard
        title="API Calls (30d)"
        value={data.overview.totalApiCalls}
        icon={<ActivityIcon />}
      />
      <StatCard
        title="Services"
        value={data.overview.servicesUsed}
        icon={<GridIcon />}
      />

      <ConnectionsByServiceChart data={data.connectionsByService} />
      <ApiUsageTrend data={data.apiUsage.trend} />
      <RecentActivityFeed items={data.recentActivity} />
    </div>
  );
}
```

## Response Fields

### Overview

| Field | Type | Description |
|-------|------|-------------|
| `totalUsers` | number | Total users with at least one connection |
| `totalConnections` | number | All connections (any status) |
| `activeConnections` | number | Connected status only |
| `totalApiCalls` | number | API calls in period |
| `servicesUsed` | number | Unique services connected |

### Connections by Service

| Field | Type | Description |
|-------|------|-------------|
| `serviceId` | string | Service identifier |
| `serviceName` | string | Display name |
| `count` | number | Number of connections |
| `percentage` | number | Percentage of total |

### API Usage

| Field | Type | Description |
|-------|------|-------------|
| `total` | number | Total API calls |
| `byEndpoint` | array | Breakdown by endpoint |
| `trend` | array | Daily counts for charting |

### Recent Activity

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Activity type |
| `userId` | string | User involved |
| `serviceId` | string | Service involved |
| `tool` | string | Tool executed (if applicable) |
| `timestamp` | string | ISO 8601 timestamp |

## Activity Types

| Type | Description |
|------|-------------|
| `connection_created` | New service connected |
| `connection_deleted` | Service disconnected |
| `connection_expired` | Connection expired |
| `tool_executed` | Tool was executed |
| `api_key_created` | New API key created |

## Notes

- Stats are cached for 5 minutes
- Activity feed shows last 20 items
- Detailed analytics available in Enterprise plan
- Data export available via separate endpoint


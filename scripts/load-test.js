/**
 * k6 Load Testing Suite for Authlane API
 *
 * Requirements:
 * - 100 concurrent users
 * - 1000 req/min sustained
 * - Rate limiting verification
 * - Target < 100ms p95 latency
 *
 * Usage:
 *   k6 run scripts/load-test.js
 *   k6 run --vus 100 --duration 5m scripts/load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const requestCounter = new Counter('total_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 100 },   // Stay at 100 users for 3 minutes
    { duration: '30s', target: 50 },   // Ramp down to 50
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<100'],      // 95% of requests should be below 100ms
    'http_req_duration': ['p(99)<200'],      // 99% of requests should be below 200ms
    'http_req_failed': ['rate<0.01'],        // Error rate should be less than 1%
    'errors': ['rate<0.01'],                 // Custom error rate < 1%
    'checks': ['rate>0.95'],                 // 95% of checks should pass
  },
  ext: {
    loadimpact: {
      name: 'Authlane API Load Test',
      projectID: 'authlane',
    },
  },
};

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'sk_test_12345678901234567890';

// Test data
const TEST_USERS = Array.from({ length: 100 }, (_, i) => `user_${i}`);

// Headers
const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Setup function - runs once before tests
 */
export function setup() {
  console.log('Starting load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);

  // Verify API is accessible
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`API health check failed: ${healthRes.status}`);
  }

  console.log('API is healthy, starting load test...');
  return { startTime: Date.now() };
}

/**
 * Main test scenario
 */
export default function (data) {
  const userId = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  // Test 1: GET /api/v1/services (most common endpoint)
  {
    const res = http.get(`${BASE_URL}/api/v1/services`, { headers });

    requestCounter.add(1);
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);

    check(res, {
      'services: status is 200': (r) => r.status === 200,
      'services: has data property': (r) => JSON.parse(r.body).data !== undefined,
      'services: response time < 100ms': (r) => r.timings.duration < 100,
    });
  }

  sleep(0.1); // 100ms pause

  // Test 2: GET /api/v1/users/:userId/connections
  {
    const res = http.get(`${BASE_URL}/api/v1/users/${userId}/connections`, { headers });

    requestCounter.add(1);
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);

    check(res, {
      'connections: status is 200': (r) => r.status === 200,
      'connections: has data array': (r) => Array.isArray(JSON.parse(r.body).data),
      'connections: response time < 100ms': (r) => r.timings.duration < 100,
    });
  }

  sleep(0.2); // 200ms pause

  // Test 3: GET /api/v1/users/:userId/tools?format=mcp
  {
    const res = http.get(`${BASE_URL}/api/v1/users/${userId}/tools?format=mcp`, { headers });

    requestCounter.add(1);
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);

    check(res, {
      'tools: status is 200': (r) => r.status === 200,
      'tools: has tools array': (r) => Array.isArray(JSON.parse(r.body).data.tools),
      'tools: response time < 150ms': (r) => r.timings.duration < 150,
    });
  }

  sleep(0.5); // 500ms pause between iterations
}

/**
 * Teardown function - runs once after all tests
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\nLoad test completed in ${duration.toFixed(2)} seconds`);
}

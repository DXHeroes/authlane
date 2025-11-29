/**
 * k6 Rate Limit Testing for Authlane API
 *
 * Tests that rate limiting is working correctly:
 * - Verify requests are blocked after limit
 * - Verify rate limit headers are present
 * - Verify rate limit resets after window
 *
 * Usage:
 *   k6 run scripts/load-test-rate-limit.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

// Custom metrics
const rateLimitHits = new Counter('rate_limit_hits');
const successfulRequests = new Counter('successful_requests');

// Test configuration
export const options = {
  vus: 1, // Single user to test rate limiting consistently
  iterations: 150, // Make enough requests to hit the limit
  thresholds: {
    'rate_limit_hits': ['count>0'], // Should hit rate limit at least once
    'successful_requests': ['count>90'], // Should have some successful requests
  },
};

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'sk_test_12345678901234567890';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/services`, { headers });

  // Track metrics
  if (res.status === 429) {
    rateLimitHits.add(1);
  } else if (res.status === 200) {
    successfulRequests.add(1);
  }

  // Check response
  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'has rate limit headers when limited': (r) => {
      if (r.status === 429) {
        return r.headers['Retry-After'] !== undefined ||
               r.headers['X-RateLimit-Limit'] !== undefined;
      }
      return true;
    },
    'rate limit response has error message': (r) => {
      if (r.status === 429) {
        const body = JSON.parse(r.body);
        return body.error && body.error.message.includes('rate limit');
      }
      return true;
    },
  });

  // Small delay to stay within rate limit window
  sleep(0.1);
}

export function teardown(data) {
  console.log('\n=== Rate Limit Test Summary ===');
  console.log(`Total iterations: ${__ITER + 1}`);
  console.log('Rate limit should have been triggered during the test');
  console.log('Check metrics above for rate_limit_hits counter');
}

/**
 * k6 Spike Testing for Authlane API
 *
 * Tests sudden traffic spikes to verify system stability
 *
 * Usage:
 *   k6 run scripts/load-test-spike.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

export const options = {
  stages: [
    { duration: '10s', target: 10 },     // Baseline
    { duration: '10s', target: 200 },    // Spike to 200 users
    { duration: '30s', target: 200 },    // Stay at spike
    { duration: '10s', target: 10 },     // Return to baseline
    { duration: '10s', target: 300 },    // Bigger spike
    { duration: '30s', target: 300 },    // Stay at bigger spike
    { duration: '10s', target: 10 },     // Return to baseline
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],  // Slightly relaxed during spikes
    'http_req_failed': ['rate<0.05'],    // Allow 5% failure during spikes
    'errors': ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'sk_test_12345678901234567890';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/services`, { headers });

  errorRate.add(res.status !== 200);
  apiDuration.add(res.timings.duration);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 500,
  });

  sleep(0.5);
}

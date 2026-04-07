import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';
const TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '30s', target: 25 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

export default function () {
  // GET weekly workouts
  const weeklyRes = http.get(`${BASE_URL}/workouts/weekly?weekStart=${new Date().toISOString().split('T')[0]}`, { headers });
  check(weeklyRes, {
    'weekly workouts 200 or 401': (r) => r.status === 200 || r.status === 401,
    'weekly response < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.5);

  // GET workout stats
  const statsRes = http.get(`${BASE_URL}/workouts/stats`, { headers });
  check(statsRes, {
    'stats 200 or 401': (r) => r.status === 200 || r.status === 401,
    'stats response < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.5);

  // GET rankings
  const rankingsRes = http.get(`${BASE_URL}/rankings/km?period=month&limit=20`, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(rankingsRes, {
    'rankings 200': (r) => r.status === 200,
    'rankings response < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(1);
}

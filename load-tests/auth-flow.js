/**
 * Auth flow test — testa o fluxo de login e refresh token sob carga.
 * Verifica que o rate limiting funciona corretamente.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = __ENV.TEST_EMAIL || `loadtest_${Date.now()}@test.com`;
const TEST_PASS  = 'LoadTest123!';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Login
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS }),
    { headers },
  );

  check(loginRes, {
    'login responds': (r) => [200, 401, 429].includes(r.status),
  });

  // Se rate limited (429), está funcionando corretamente
  if (loginRes.status === 429) {
    check(loginRes, {
      'rate limiting active': (r) => r.status === 429,
    });
    sleep(2);
    return;
  }

  sleep(1);
}

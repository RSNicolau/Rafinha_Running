/**
 * Smoke test — verifica que a API está respondendo corretamente.
 * 1 usuário virtual, 30 segundos.
 * Executar antes de qualquer deploy ou teste maior.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],      // < 1% erros
    http_req_duration: ['p(95)<500'],    // 95% < 500ms
  },
};

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health status 200': (r) => r.status === 200,
    'health body ok': (r) => r.json('status') === 'ok',
  });

  // Public onboarding form (não requer auth)
  const form = http.get(`${BASE_URL}/api/v1/onboarding/public/test-coach`);
  check(form, {
    'onboarding form responds': (r) => r.status === 200 || r.status === 404,
  });

  // Rankings (público, com cache)
  const rankings = http.get(`${BASE_URL}/api/v1/rankings?period=week&limit=10`);
  check(rankings, {
    'rankings responds': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}

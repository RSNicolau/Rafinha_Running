/**
 * Stress test — encontra o ponto de ruptura da API.
 * Aumenta VUs progressivamente até encontrar degradação.
 * NÃO executar em produção sem aviso prévio.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '2m',  target: 50  },
    { duration: '2m',  target: 100 },
    { duration: '2m',  target: 200 },
    { duration: '2m',  target: 300 },
    { duration: '2m',  target: 400 },
    { duration: '2m',  target: 500 },
    { duration: '3m',  target: 0   },  // recovery
  ],
  thresholds: {
    http_req_failed:   ['rate<0.10'],   // toleramos até 10% de erros em stress
    http_req_duration: ['p(95)<3000'],  // 95% < 3s
  },
};

export default function () {
  const r = http.get(`${BASE_URL}/health`);
  check(r, { 'health alive': (res) => res.status === 200 });
  sleep(0.5);
}

/**
 * Load test — simula carga normal de produção.
 * Rampa até 100 VUs, sustenta por 3 minutos, descida.
 * Representa um dia normal com ~100 usuários simultâneos.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '1m',  target: 20  },  // warm up
    { duration: '3m',  target: 100 },  // carga normal
    { duration: '1m',  target: 0   },  // cool down
  ],
  thresholds: {
    http_req_failed:   ['rate<0.02'],   // < 2% erros
    http_req_duration: ['p(95)<800'],   // 95% < 800ms
    http_req_duration: ['p(99)<2000'],  // 99% < 2s
  },
};

const params = AUTH_TOKEN
  ? { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
  : {};

export default function () {
  const scenarios = [
    () => {
      // Health check (sem auth)
      const r = http.get(`${BASE_URL}/health`);
      check(r, { 'health ok': (res) => res.status === 200 });
    },
    () => {
      // Rankings (cache quente)
      const r = http.get(`${BASE_URL}/api/v1/rankings?period=week`, params);
      check(r, { 'rankings ok': (res) => [200, 401].includes(res.status) });
    },
    () => {
      // Onboarding público
      const r = http.get(`${BASE_URL}/api/v1/onboarding/public/test-coach`);
      check(r, { 'onboarding ok': (res) => [200, 404].includes(res.status) });
    },
    () => {
      // Perfil (requer auth)
      if (!AUTH_TOKEN) return;
      const r = http.get(`${BASE_URL}/api/v1/users/me`, params);
      check(r, { 'profile ok': (res) => res.status === 200 });
    },
  ];

  // Executa cenário aleatório para simular mix real de tráfego
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  sleep(Math.random() * 2 + 0.5); // think time 0.5-2.5s
}

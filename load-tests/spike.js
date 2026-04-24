/**
 * Spike test — simula pico repentino de tráfego.
 * Ex: post viral no Instagram, resultado de uma prova publicado.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 10  },  // normal
    { duration: '10s', target: 500 },  // SPIKE!
    { duration: '1m',  target: 500 },  // pico sustentado
    { duration: '10s', target: 10  },  // volta ao normal
    { duration: '2m',  target: 10  },  // confirmação de recovery
    { duration: '30s', target: 0   },  // fim
  ],
  thresholds: {
    http_req_failed:   ['rate<0.05'],  // < 5% erros durante spike
    http_req_duration: ['p(95)<5000'], // 95% < 5s durante spike
  },
};

export default function () {
  // Rankings são o endpoint mais hit num evento viral
  const r = http.get(`${BASE_URL}/api/v1/rankings?period=month&limit=20`);
  check(r, { 'rankings survives spike': (res) => [200, 401, 429].includes(res.status) });
  sleep(0.1);
}

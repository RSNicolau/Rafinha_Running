# Load Tests — RR Rafinha Running

Scripts de load testing usando [k6](https://k6.io/).

## Instalação
```bash
brew install k6          # macOS
# ou
docker pull grafana/k6   # Docker
```

## Executar

```bash
# Smoke test (1 VU, 30s) — verificar se está de pé
k6 run load-tests/smoke.js -e BASE_URL=https://rrapi-production.up.railway.app

# Load test (100 VUs, 5min) — carga normal
k6 run load-tests/load.js -e BASE_URL=https://rrapi-production.up.railway.app

# Stress test (rampa até 500 VUs) — encontrar limite
k6 run load-tests/stress.js -e BASE_URL=https://rrapi-production.up.railway.app

# Spike test (pico repentino)
k6 run load-tests/spike.js -e BASE_URL=https://rrapi-production.up.railway.app
```

## Thresholds esperados (produção)
- p95 latência < 500ms
- p99 latência < 1000ms
- Error rate < 1%

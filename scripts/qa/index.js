// Permite rodar `node --test scripts/qa/` no Node 22 (que trata o diretório como módulo e carrega este index.js).
// Os testes de verdade estão em jev-ux-audit.test.mjs.
import('./jev-ux-audit.test.mjs');

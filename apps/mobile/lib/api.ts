/**
 * lib/api.ts
 *
 * Public re-export of the Axios instance.
 * The real implementation lives in src/services/api.ts — this module
 * provides the short path `lib/api` expected by the project spec.
 */
export { api, setAuthLogout } from '../src/services/api';
export { default } from '../src/services/api';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  'https://rrapi-production.up.railway.app/api/v1';

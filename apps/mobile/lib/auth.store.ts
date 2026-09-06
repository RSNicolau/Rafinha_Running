/**
 * lib/auth.store.ts
 *
 * Public re-export of the Zustand auth store.
 * The real implementation lives in src/stores/auth.store.ts — this module
 * provides the short path `lib/auth.store` expected by the project spec.
 */
export { useAuthStore } from '../src/stores/auth.store';

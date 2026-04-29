import axios from 'axios';
import { clearAuthCookie } from './auth-cookie';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Garantir prefixo /v1/ em todas as chamadas (fallback para compatibilidade)
api.interceptors.request.use((config) => {
  if (config.url && !config.url.startsWith('/v1/') && !config.url.startsWith('http')) {
    config.url = '/v1' + (config.url.startsWith('/') ? config.url : '/' + config.url);
  }
  return config;
});

// Attach token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rr_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 → try refresh token, then redirect to login
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('rr_refresh_token');

      if (refreshToken && !isRefreshing) {
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          const newToken = data.accessToken;

          localStorage.setItem('rr_access_token', newToken);
          if (data.refreshToken) {
            localStorage.setItem('rr_refresh_token', data.refreshToken);
          }

          // Retry all queued requests with new token
          refreshQueue.forEach((cb) => cb(newToken));
          refreshQueue = [];
          isRefreshing = false;

          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed → logout
          isRefreshing = false;
          refreshQueue = [];
          localStorage.removeItem('rr_access_token');
          localStorage.removeItem('rr_refresh_token');
          localStorage.removeItem('rr_user');
          clearAuthCookie();
          // Detect which portal to redirect to
          const path = window.location.pathname;
          window.location.href = path.startsWith('/athlete') ? '/athlete-login' : '/login';
        }
      } else if (refreshToken && isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          refreshQueue.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      } else {
        // No refresh token → immediate logout
        localStorage.removeItem('rr_access_token');
        localStorage.removeItem('rr_refresh_token');
        localStorage.removeItem('rr_user');
        clearAuthCookie();
        const path = window.location.pathname;
        window.location.href = path.startsWith('/athlete') ? '/athlete-login' : '/login';
      }
    }
    return Promise.reject(error);
  },
);

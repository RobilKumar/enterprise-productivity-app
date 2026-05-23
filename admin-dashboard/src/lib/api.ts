/**
 * Shared Axios instance — used by ALL pages.
 * VITE_API_URL is injected at build time via .env.mobile (for APK)
 * and falls back to the Vite dev-server proxy path for web builds.
 */
import axios from 'axios';

export const API = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string) || '/api/v1',
});

API.interceptors.request.use((c) => {
  const t = localStorage.getItem('accessToken');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

API.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('refreshToken');
      if (refresh) {
        try {
          const base = (import.meta.env.VITE_API_URL as string) || '/api/v1';
          const { data } = await axios.post(`${base}/auth/refresh`, { refreshToken: refresh });
          localStorage.setItem('accessToken',  data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          err.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return API(err.config);
        } catch {
          localStorage.clear();
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(err);
  }
);

'use client';

import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // This is crucial for sending cookies with requests
});

// No longer need to set auth token manually
export const setAuthToken = (token: string | null) => {
    // This function is now a no-op as tokens are handled by HttpOnly cookies.
};

api.interceptors.request.use(config => {
  const method = config.method?.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
    const csrfToken = Cookies.get('csrf_token');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    } else {
      console.warn('[API Interceptor] CSRF token cookie not found for state-changing request.');
    }
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// --- Single-flight refresh ---
// Prevents multiple concurrent 401s (e.g. from a polling loop) from each
// firing their own /api/auth/refresh call and tripping the refresh
// endpoint's own rate limiter (429), which previously caused every
// subsequent poll to fail permanently once one refresh attempt lost the race.
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/api/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Add a response interceptor to handle token refresh logic
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Check if the error is 401, not a retry, and NOT the refresh or login endpoint
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/api/auth/refresh' &&
      originalRequest.url !== '/api/auth/login'
    ) {
      originalRequest._retry = true;

      try {
        // All concurrent 401s await the SAME refresh call instead of each
        // starting their own — this is the fix for the 429 cascade.
        await refreshSession();

        // The /api/auth/refresh endpoint sets the new access token cookie itself.
        // We can just retry the original request.
        return api(originalRequest);
      } catch (refreshError) {
        // If refresh fails, we should log the user out.
        // This will be caught by the AuthGuard or page logic.
        console.error("Session refresh failed. User should be logged out.", refreshError);
        // Important: Use a different error to avoid re-triggering the interceptor
        return Promise.reject(new Error("Session refresh failed"));
      }
    }

    return Promise.reject(error);
  }
);

export default api;
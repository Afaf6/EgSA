import axios from 'axios';

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';
const MAX_DATASET_RETRIES = 3;
const knownTelemetryRevisions = new Map();

/** Reports when a project's telemetry was replaced since the last response. */
function noteTelemetryRevision(response) {
  const revision = response?.headers?.['x-telemetry-revision'];
  if (revision === undefined) return;
  const config = response.config || {};
  const projectId = config.params?.projectId || String(config.url || '').split('?')[0];
  const previous = knownTelemetryRevisions.get(projectId);
  knownTelemetryRevisions.set(projectId, revision);
  if (previous !== undefined && previous !== revision && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('egse:telemetry-dataset-changed', { detail: { projectId, revision } }));
  }
}

export function setupInterceptors(client, customAxios = axios, storage = (typeof localStorage !== 'undefined' ? localStorage : null), baseUrl = BASE_URL) {
  let isRefreshing = false;
  let failedQueue = [];

  const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    failedQueue = [];
  };

  // Request Interceptor: Attach JWT Token
  client.interceptors.request.use(
    (config) => {
      const token = storage?.getItem('egse_access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response Interceptor: Seamless Token Refresh & Error Normalization
  client.interceptors.response.use(
    (response) => {
      noteTelemetryRevision(response);
      return response.data;
    },
    async (error) => {
      const originalRequest = error.config;
      if (!originalRequest) {
        return Promise.reject(normalizeError(error));
      }

      // Telemetry is briefly closed while a replacement commits: retry reads automatically
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      const retries = originalRequest._datasetRetries || 0;
      if (
        error.response?.status === 503
        && retryAfter > 0
        && (originalRequest.method || 'get').toLowerCase() === 'get'
        && retries < MAX_DATASET_RETRIES
      ) {
        originalRequest._datasetRetries = retries + 1;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('egse:telemetry-dataset-updating'));
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return client(originalRequest);
      }

      // Handle 401 Unauthorized (Token expired)
      if (error.response?.status === 401 && !originalRequest._retry) {
        // Multi-tab check: Did another tab already refresh the access token?
        const currentReqToken = originalRequest.headers?.Authorization?.replace(/^Bearer\s+/, '') || '';
        const storedAccessToken = storage?.getItem('egse_access_token');

        if (storedAccessToken && storedAccessToken !== currentReqToken) {
          // Another tab already refreshed the access token in localStorage
          originalRequest._retry = true;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${storedAccessToken}`;
          return client(originalRequest);
        }

        const refreshToken = storage?.getItem('egse_refresh_token');

        // If no refresh token or already retried or login/refresh endpoint itself failed
        if (!refreshToken || originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh-token')) {
          const latestAccess = storage?.getItem('egse_access_token');
          if (!latestAccess) {
            storage?.removeItem('egse_access_token');
            storage?.removeItem('egse_refresh_token');
            storage?.removeItem('egse_user');
          }
          return Promise.reject(normalizeError(error));
        }

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return client(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await customAxios.post(`${baseUrl}/auth/refresh-token`, { refreshToken });
          // Exact server shape: { success, data: { token, refreshToken, user } }
          const { token, refreshToken: newRefreshToken } = res.data.data;
          if (typeof token !== 'string' || !token || typeof newRefreshToken !== 'string' || !newRefreshToken) {
            throw new Error('Malformed refresh-token response');
          }

          storage?.setItem('egse_access_token', token);
          storage?.setItem('egse_refresh_token', newRefreshToken);

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('egse:token_refreshed', { detail: { token } }));
          }

          client.defaults.headers.common.Authorization = `Bearer ${token}`;
          processQueue(null, token);

          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        } catch (refreshErr) {
          // Multi-tab check before clearing storage: Did another tab succeed in refreshing?
          const latestRefreshToken = storage?.getItem('egse_refresh_token');
          const latestAccessToken = storage?.getItem('egse_access_token');

          if (latestRefreshToken && latestRefreshToken !== refreshToken && latestAccessToken) {
            // Another tab succeeded and stored a fresh token!
            // Do NOT clear localStorage. Re-read the new token from storage instead of logging out
            client.defaults.headers.common.Authorization = `Bearer ${latestAccessToken}`;
            processQueue(null, latestAccessToken);
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${latestAccessToken}`;
            return client(originalRequest);
          }

          // Refresh definitively failed across all tabs
          processQueue(refreshErr, null);
          storage?.removeItem('egse_access_token');
          storage?.removeItem('egse_refresh_token');
          storage?.removeItem('egse_user');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('egse:session_expired'));
          }
          return Promise.reject(normalizeError(refreshErr));
        } finally {
          isRefreshing = false;
        }
      }

      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          try {
            error.response.data = JSON.parse(text);
          } catch {
            error.response.data = { message: text };
          }
        } catch {}
      }

      return Promise.reject(normalizeError(error));
    }
  );

  return client;
}

export function normalizeError(error) {
  if (
    axios.isCancel(error) ||
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    error?.message === 'canceled'
  ) {
    return {
      name: 'CanceledError',
      code: 'ERR_CANCELED',
      message: 'canceled',
      statusCode: 0,
      details: null,
      raw: error,
      isCancel: true,
    };
  }

  // Timeout handling (distinguishes upload & processing timeouts from generic network errors)
  if (
    error?.code === 'ECONNABORTED' ||
    error?.message?.toLowerCase().includes('timeout') ||
    error?.response?.status === 408 ||
    error?.response?.status === 504
  ) {
    const serverMsg = error.response?.data?.error?.message || error.response?.data?.message;
    return {
      name: 'TimeoutError',
      code: 'TIMEOUT_ERROR',
      message:
        serverMsg ||
        'Ingestion timeout: The request exceeded the configured timeout limit. Note: The server may still be processing in the background.',
      statusCode: error.response?.status || 408,
      details: null,
      raw: error,
      isTimeout: true,
    };
  }

  const errPayload = error.response?.data?.error;
  const code = errPayload?.code || (error.response?.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');
  const message =
    errPayload?.message ||
    error.response?.data?.message ||
    error.message ||
    'An unexpected network error occurred';
  const statusCode = errPayload?.statusCode || error.response?.status || 500;
  const details = errPayload?.details || null;

  return {
    code,
    message,
    statusCode,
    details,
    raw: error,
  };
}

const axiosClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

setupInterceptors(axiosClient, axios, typeof localStorage !== 'undefined' ? localStorage : null, BASE_URL);

export default axiosClient;

/**
 * API client entry point.
 *
 *  - Demo mode (default): every request is answered by the in-browser mock
 *    backend in src/mock/ — no server needed.
 *  - Real mode: set VITE_USE_MOCK=false and the original axios client
 *    (axiosClient.real.js) talks to your Express/MongoDB backend again.
 */
import realClient, { setupInterceptors, normalizeError } from './axiosClient.real';
import { USE_MOCK } from '../mock/config';
import { handleRequest, MockHttpError } from '../mock/mockServer';

function toNormalizedError(err) {
  if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
    return normalizeError(err);
  }
  if (err instanceof MockHttpError) {
    return {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details,
      raw: { response: { status: err.statusCode, data: { message: err.message, error: { code: err.code, message: err.message, details: err.details } } } },
    };
  }
  return { code: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Unexpected mock error', statusCode: 500, details: null, raw: err };
}

function createMockClient() {
  const call = async (method, url, data, config = {}) => {
    try {
      return await handleRequest(method, url, { query: config.params, body: data, config });
    } catch (err) {
      throw toNormalizedError(err);
    }
  };

  return {
    get: (url, config) => call('GET', url, undefined, config),
    delete: (url, config) => call('DELETE', url, undefined, config),
    post: (url, data, config) => call('POST', url, data, config),
    put: (url, data, config) => call('PUT', url, data, config),
    patch: (url, data, config) => call('PATCH', url, data, config),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
  };
}

const axiosClient = USE_MOCK ? createMockClient() : realClient;

export { setupInterceptors, normalizeError };
export default axiosClient;

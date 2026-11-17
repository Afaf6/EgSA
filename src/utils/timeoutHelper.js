/**
 * Telemetry Ingestion Timeout Helper
 *
 * Provides shared validation, duration formatting, and sessionStorage persistence
 * for user-configurable ingestion timeouts.
 */

export const DEFAULT_INGESTION_TIMEOUT_SECONDS = 90;
export const SESSION_STORAGE_TIMEOUT_KEY = 'egse_ingestion_timeout_seconds';

// Node.js setTimeout 32-bit signed integer milliseconds maximum: 2,147,483,647 ms
// Any timeout beyond this will overflow Node's internal timer and default to 1ms.
export const MAX_SAFE_TIMEOUT_SECONDS = Math.floor(2147483647 / 1000); // 2,147,483 seconds (~24.8 days)

/**
 * Validates user-provided timeout input string or number.
 * Enforces positive integers within safe range.
 *
 * @param {*} value
 * @returns {{ valid: boolean, error: string|null, value: number|null }}
 */
export function validateTimeoutInput(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return {
      valid: false,
      error: 'Ingestion timeout is required and cannot be empty.',
      value: null,
    };
  }

  const s = String(value).trim();

  if (s.includes('.')) {
    return {
      valid: false,
      error: 'Decimals are not permitted. Please enter a whole positive integer in seconds.',
      value: null,
    };
  }

  if (s.startsWith('-')) {
    return {
      valid: false,
      error: 'Negative values are not permitted. Timeout must be a positive integer.',
      value: null,
    };
  }

  if (!/^\d+$/.test(s)) {
    return {
      valid: false,
      error: 'Invalid input. Ingestion timeout must contain only numeric digits.',
      value: null,
    };
  }

  const num = Number(s);

  if (!Number.isSafeInteger(num) || num <= 0) {
    return {
      valid: false,
      error: 'Ingestion timeout must be a positive integer (minimum 1 second).',
      value: null,
    };
  }

  if (num > MAX_SAFE_TIMEOUT_SECONDS) {
    return {
      valid: false,
      error: `Value exceeds system timer limit of ${MAX_SAFE_TIMEOUT_SECONDS.toLocaleString('en-US')} seconds (~24.8 days).`,
      value: null,
    };
  }

  return {
    valid: true,
    error: null,
    value: num,
  };
}

/**
 * Formats a seconds duration into human-readable text.
 * e.g. 90 -> "90s (1m 30s)", 3600 -> "3600s (1h)", 30 -> "30s"
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTimeoutDuration(seconds) {
  if (!seconds || typeof seconds !== 'number' || seconds <= 0) {
    return '';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remSeconds = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remSeconds > 0) parts.push(`${remSeconds}s`);

  return `${seconds}s (${parts.join(' ')})`;
}

/**
 * Reads the persisted ingestion timeout from sessionStorage, falling back to default (90).
 *
 * @returns {number}
 */
export function getStoredIngestionTimeout() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem(SESSION_STORAGE_TIMEOUT_KEY);
      if (stored) {
        const validated = validateTimeoutInput(stored);
        if (validated.valid && validated.value !== null) {
          return validated.value;
        }
      }
    }
  } catch (_) {}
  return DEFAULT_INGESTION_TIMEOUT_SECONDS;
}

/**
 * Persists the ingestion timeout into sessionStorage.
 *
 * @param {number|string} seconds
 */
export function setStoredIngestionTimeout(seconds) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_TIMEOUT_KEY, String(seconds));
    }
  } catch (_) {}
}

/**
 * Parameter Status Representation Helper (DECIMAL ONLY)
 *
 * Rules:
 * 1. Values are evaluated against the final engineering value (post-scaling/equation).
 * 2. Supported formats: pure decimal numbers (integers e.g. "0", "1", "20", and fractions e.g. "20.5", "-1.25", "0.125").
 *    Hexadecimal (0x...), binary (0b...), octal, NaN, or non-numeric strings are strictly rejected.
 * 3. Safe numerical matching: exact float comparison / normalized decimal string, and BigInt for large integers.
 * 4. Does not alter underlying raw values or engineering values.
 */

/**
 * Normalizes decimal number strings for duplicate detection and safe comparison.
 * Preserves 64-bit integer values safely without float precision drift.
 *
 * @param {*} val
 * @returns {string|null}
 */
export function normalizeDecimalString(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;

  if (!s.includes('.')) {
    try {
      const bi = BigInt(s);
      return bi === 0n ? '0' : bi.toString();
    } catch {
      return s;
    }
  }

  let sign = '';
  let rest = s;
  if (rest.startsWith('-')) {
    sign = '-';
    rest = rest.slice(1);
  }
  let [intPart, fracPart] = rest.split('.');
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (!intPart) intPart = '0';
  fracPart = fracPart.replace(/0+$/, '');

  if (fracPart === '') {
    if (intPart === '0') return '0';
    return sign + intPart;
  }

  if (intPart === '0' && /^0+$/.test(fracPart)) {
    return '0';
  }

  return sign + intPart + '.' + fracPart;
}

/**
 * Validates whether a string or number represents a pure decimal number (integer or fraction).
 */
export function isDecimalNumber(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  return /^-?\d+(\.\d+)?$/.test(s);
}

// Backward-compatible alias
export const isDecimalInteger = isDecimalNumber;

/**
 * Matches an engineering telemetry value against a parameter's statusRepresentation mappings
 * and returns the full matched mapping object, or null if unmatched.
 *
 * @param {string|number|bigint} engValue - Final engineering telemetry value
 * @param {Array<{ rawValue: string, status: string, description?: string }>} statusRepresentation - Configured mappings
 * @returns {{ rawValue: string, status: string, description?: string }|null}
 */
export function getStatusRepresentationMatch(engValue, statusRepresentation) {
  if (!Array.isArray(statusRepresentation) || statusRepresentation.length === 0) {
    return null;
  }
  if (engValue === null || engValue === undefined || engValue === '') {
    return null;
  }

  try {
    const isEngBool = typeof engValue === 'boolean';
    const effectiveEngValue = isEngBool ? (engValue ? 1 : 0) : engValue;

    const isEngNumber = typeof effectiveEngValue === 'number' && Number.isFinite(effectiveEngValue);
    const isEngBigInt = typeof effectiveEngValue === 'bigint';
    const engNorm = (!isEngBigInt && (isEngNumber || typeof effectiveEngValue === 'string'))
      ? normalizeDecimalString(effectiveEngValue)
      : null;

    for (const item of statusRepresentation) {
      if (!item || item.rawValue === undefined || item.rawValue === null) continue;
      const itemStr = String(item.rawValue).trim();
      if (!/^-?\d+(\.\d+)?$/.test(itemStr)) continue;

      if (isEngBigInt) {
        if (!itemStr.includes('.') && BigInt(itemStr) === effectiveEngValue) {
          return item;
        }
      } else if (isEngNumber) {
        const itemNum = Number(itemStr);
        if (Number.isFinite(itemNum) && (effectiveEngValue === itemNum || Math.abs(effectiveEngValue - itemNum) < 1e-9)) {
          return item;
        }
      } else if (engNorm !== null) {
        const itemNorm = normalizeDecimalString(itemStr);
        if (itemNorm !== null && engNorm === itemNorm) {
          return item;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Matches an engineering telemetry value against a parameter's statusRepresentation mappings.
 *
 * @param {string|number|bigint} engValue - Final engineering telemetry value
 * @param {Array<{ rawValue: string, status: string, description?: string }>} statusRepresentation - Configured mappings
 * @returns {string|null} - The matched status string, or null if unmatched
 */
export function matchStatusRepresentation(engValue, statusRepresentation) {
  const match = getStatusRepresentationMatch(engValue, statusRepresentation);
  return match?.status || null;
}

/**
 * Returns the CSS badge class for a status label string based on common telemetry semantics.
 *
 * @param {string} status
 * @returns {string}
 */
/**
 * A failed equation has no engineering value and is stored as INVALID.
 * Its raw value must never be shown or plotted in place of the engineering value.
 */
export function isFailedEquationReading(reading) {
  if (!reading) return false;
  const value = reading.engineeringValue !== undefined ? reading.engineeringValue : reading.value;
  if (value !== null && value !== undefined) return false;
  return String(reading.limitStatus || reading.status || '').trim().toLowerCase() === 'invalid';
}

/** Badge attributes for a reading's limit status. INVALID uses the same purple as the other status views. */
export function getLimitStatusBadge(limitStatus) {
  const s = String(limitStatus || '').trim().toLowerCase();
  if (s === 'invalid') {
    return {
      className: 'badge',
      style: {
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        color: '#c084fc',
        border: '1px solid rgba(168, 85, 247, 0.5)',
      },
    };
  }
  if (s === 'alarm' || s === 'critical') return { className: 'badge bg-danger' };
  if (s === 'warning') return { className: 'badge bg-warning text-dark' };
  return { className: 'badge bg-success' };
}

export function getStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase().trim();
  if (s.includes('crit') || s.includes('alarm') || s.includes('err') || s.includes('fail')) {
    return 'badge bg-danger bg-opacity-20 text-danger border border-danger border-opacity-30';
  }
  if (s.includes('warn')) {
    return 'badge bg-warning bg-opacity-20 text-warning border border-warning border-opacity-30';
  }
  if (s.includes('norm') || s.includes('nom') || s.includes('ok') || s.includes('pass')) {
    return 'badge bg-success bg-opacity-20 text-success border border-success border-opacity-30';
  }
  return 'badge bg-info bg-opacity-20 text-info border border-info border-opacity-30';
}

/**
 * Validates an array of status representation mapping draft items.
 * Enforces decimal-only values, non-empty status labels, and no duplicate decimal values.
 *
 * @param {Array<{ rawValue: string, status: string, description?: string }>} draftList
 * @returns {{ valid: boolean, error: string|null, cleanList: Array }}
 */
export function validateStatusRepresentationDraft(draftList) {
  if (!Array.isArray(draftList) || draftList.length === 0) {
    return { valid: true, error: null, cleanList: [] };
  }

  const cleanList = [];
  const seenDecimals = new Set();

  for (let i = 0; i < draftList.length; i++) {
    const item = draftList[i];
    if (!item) continue;

    const rawStr = String(item.rawValue ?? '').trim();
    const statusStr = String(item.status ?? '').trim();
    const descStr = String(item.description ?? '').trim();

    // If completely empty row, skip it
    if (!rawStr && !statusStr && !descStr) continue;

    if (!rawStr) {
      return {
        valid: false,
        error: `Item #${i + 1}: Value is required.`,
        cleanList: [],
      };
    }

    if (!/^-?\d+(\.\d+)?$/.test(rawStr)) {
      return {
        valid: false,
        error: `Item #${i + 1}: Value '${rawStr}' must be a decimal number (e.g. 0, 1, 20.5, -1.25). Binary or hexadecimal formats are not supported.`,
        cleanList: [],
      };
    }

    if (!statusStr) {
      return {
        valid: false,
        error: `Item #${i + 1}: Status label is required.`,
        cleanList: [],
      };
    }

    const norm = normalizeDecimalString(rawStr);
    if (!norm) {
      return {
        valid: false,
        error: `Item #${i + 1}: Invalid decimal number '${rawStr}'.`,
        cleanList: [],
      };
    }

    if (seenDecimals.has(norm)) {
      return {
        valid: false,
        error: `Duplicate decimal value '${rawStr}' in status representation.`,
        cleanList: [],
      };
    }
    seenDecimals.add(norm);

    cleanList.push({
      rawValue: rawStr,
      status: statusStr,
      description: descStr,
    });
  }

  return { valid: true, error: null, cleanList };
}

/**
 * Validates whether a range bound is configured with a valid finite number.
 * Unsafe values like null, undefined, empty string (''), or non-numeric strings return false.
 */
export function isValidBound(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  const num = Number(val);
  return Number.isFinite(num);
}

/**
 * Checks whether a range object has at least one valid bound configured.
 */
export function hasConfiguredRange(rng) {
  if (!rng || typeof rng !== 'object') return false;
  return isValidBound(rng.min) || isValidBound(rng.max);
}

/**
 * Tests whether a finite number falls within a [min, max] range.
 */
function inRange(rng, num) {
  if (!rng || typeof rng !== 'object') return false;
  const hasMin = isValidBound(rng.min);
  const hasMax = isValidBound(rng.max);
  if (!hasMin && !hasMax) return false;
  const numMin = hasMin ? Number(rng.min) : -Infinity;
  const numMax = hasMax ? Number(rng.max) : Infinity;
  return num >= numMin && num <= numMax;
}

/**
 * Evaluates the current dynamic limit status for a reading against the latest parameter configuration.
 * Handles numeric values, boolean conversions, physical range boundaries (minValue/maxValue),
 * explicit statusRanges (normal, warning, critical), and concentric legacy thresholds.
 *
 * @param {Object} reading - Telemetry reading ({ engineeringValue, value, rawValue, status, limitStatus })
 * @param {Object} param - Parameter document or configuration ({ minValue, maxValue, limits, statusRanges })
 * @returns {string} Status ('NORMAL', 'WARNING', 'CRITICAL', 'ALARM', 'INVALID', 'UNKNOWN')
 */
export function evaluateParameterStatus(reading, param) {
  if (!reading) return 'UNKNOWN';

  const rawEngVal =
    reading.engineeringValue !== undefined
      ? reading.engineeringValue
      : reading.value !== undefined
      ? reading.value
      : null;

  // A failed equation has no engineering value, and its raw value must not be judged in its place
  if (isFailedEquationReading(reading)) {
    return 'INVALID';
  }

  let numVal = null;
  if (typeof rawEngVal === 'number' && Number.isFinite(rawEngVal)) {
    numVal = rawEngVal;
  } else if (typeof rawEngVal === 'boolean') {
    numVal = rawEngVal ? 1 : 0;
  } else if (typeof reading.rawValue === 'number' && Number.isFinite(reading.rawValue)) {
    numVal = reading.rawValue;
  } else if (typeof reading.rawValue === 'bigint') {
    numVal = Number(reading.rawValue);
  } else if (rawEngVal !== null && rawEngVal !== undefined && rawEngVal !== '' && !isNaN(Number(rawEngVal))) {
    numVal = Number(rawEngVal);
  }

  // If parameter definition is available, evaluate dynamically against latest param config
  if (param && typeof param === 'object') {
    // 1. Min / Max physical range check -> INVALID
    if (numVal !== null) {
      const hasMin = param.minValue !== null && param.minValue !== undefined && param.minValue !== '';
      const hasMax = param.maxValue !== null && param.maxValue !== undefined && param.maxValue !== '';
      if ((hasMin && numVal < Number(param.minValue)) || (hasMax && numVal > Number(param.maxValue))) {
        return 'INVALID';
      }
    }

    // 2. Status Ranges check (NORMAL / WARNING / CRITICAL)
    const statusRanges = param.limits?.statusRanges || param.statusRanges;
    if (statusRanges && typeof statusRanges === 'object') {
      const { normal, critical, warning } = statusRanges;
      const hasNormal = hasConfiguredRange(normal);
      const hasWarning = hasConfiguredRange(warning);
      const hasCritical = hasConfiguredRange(critical);

      if (hasNormal || hasWarning || hasCritical) {
        if (numVal === null || !Number.isFinite(numVal)) return 'UNKNOWN';

        if (inRange(normal, numVal)) return 'NORMAL';
        if (inRange(warning, numVal)) return 'WARNING';
        if (inRange(critical, numVal)) return 'CRITICAL';
        return 'UNKNOWN';
      }
    }

    // 3. Legacy concentric thresholds (alarmLow, alarmHigh, warningLow, etc.)
    const limits = param.limits || param;
    const alarmLow = limits.alarmLow ?? null;
    const alarmHigh = limits.alarmHigh ?? null;
    const warningLow = limits.warningLow ?? limits.warnLow ?? null;
    const warningHigh = limits.warningHigh ?? limits.warnHigh ?? null;
    const normalLow = limits.normalLow ?? null;
    const normalHigh = limits.normalHigh ?? null;

    if (numVal !== null) {
      if (alarmLow !== null && numVal < Number(alarmLow)) return 'ALARM';
      if (alarmHigh !== null && numVal > Number(alarmHigh)) return 'ALARM';
      if (warningLow !== null && numVal < Number(warningLow)) return (reading.status === 'WARNING_LOW' || limits.warningLow !== undefined ? 'WARNING_LOW' : 'WARNING');
      if (warningHigh !== null && numVal > Number(warningHigh)) return (reading.status === 'WARNING_HIGH' || limits.warningHigh !== undefined ? 'WARNING_HIGH' : 'WARNING');
      if (normalLow !== null && numVal < Number(normalLow)) return 'WARNING';
      if (normalHigh !== null && numVal > Number(normalHigh)) return 'WARNING';
      if (alarmLow !== null || alarmHigh !== null || warningLow !== null || warningHigh !== null || normalLow !== null || normalHigh !== null) {
        return 'NORMAL';
      }
    }
  }

  // Fallback to reading's stored status if param or param limits are unconfigured
  const rawStatus = reading.status || reading.limitStatus || '';
  if (!rawStatus) return 'UNKNOWN';
  const s = String(rawStatus).toLowerCase().trim();
  if (s.includes('invalid')) return 'INVALID';
  if (s.includes('crit') || s.includes('alarm')) return 'CRITICAL';
  if (s.includes('warn')) return rawStatus;
  if (s === 'normal' || s === 'nominal' || s === 'ok') return 'NORMAL';
  return s.toUpperCase();
}

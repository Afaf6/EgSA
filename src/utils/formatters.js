// Formatting helpers shared across all telemetry screens.
// These mirror the export/back-end conventions described in the spec:
//   - invalid readings -> "nan"
//   - the sentinel value 327.67 -> "-"
//   - hex registers -> "0xXXXXXXXX" (uppercase, zero-padded)
//   - enums -> their text label, not the raw integer

const INVALID_SENTINEL = 327.67;

export const TELEMETRY_FLOAT_MAX_DECIMALS = Object.freeze({
  float32: 6,
  float64: 8,
});

const SCIENTIFIC_NOTATION_MAX = 1e21;

function trimFractionZeros(value) {
  const [mantissa, exponent] = value.split("e");
  const trimmed = mantissa.includes(".") ? mantissa.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1") : mantissa;
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`;
}

export function isFloatingPointType(dataType) {
  if (!dataType) return false;
  const type = String(dataType || "").trim().toLowerCase().replace(/[_s-]/g, "");
  return (
    type.startsWith("float") ||
    type.startsWith("double") ||
    type === "f32" ||
    type === "f64" ||
    type === "real"
  );
}

function getFloatPrecision(dataType) {
  const type = String(dataType || "").trim().toLowerCase().replace(/[_s-]/g, "");
  if (["double", "f64", "float64"].includes(type) || /^(double|f64|float64)/.test(type)) {
    return 10;
  }
  if (["float", "f32", "float32", "real"].includes(type) || /^(float|f32|float32|real)/.test(type)) {
    return 10;
  }
  return null;
}

/** Format telemetry values while preserving non-floating display conventions. */
export function formatTelemetryValue(value, dataType, options = {}) {
  const { precision = null, missingValue = "—" } = options;
  if (value === null || value === undefined) return missingValue;
  if (typeof value === "string" && ["nan", "infinity", "+infinity", "-infinity"].includes(value.trim().toLowerCase())) {
    return missingValue;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";

  if (isFloatingPointType(dataType)) {
    const numericValue = typeof value === "number" ? value : (typeof value === "string" && value.trim() !== "" ? Number(value) : NaN);
    if (!Number.isFinite(numericValue)) return missingValue;
    // All floating-point datatypes strictly display exactly 10 decimals, regardless of configured param.precision
    return numericValue.toFixed(10);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return missingValue;
    if (Number.isInteger(value)) return String(value);
    const decimals = precision !== null && precision !== undefined ? precision : 3;
    return value.toFixed(decimals);
  }
  return String(value);
}

export function formatValue(value, { decimals = 2, unit = "" } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "nan";
  }
  if (Math.abs(value - INVALID_SENTINEL) < 1e-6) {
    return "-";
  }
  const formatted = Number(value).toFixed(decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Format a raw register/word as a zero-padded uppercase hex string. */
export function formatHex(value, bytes = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0x" + "0".repeat(bytes * 2);
  }
  const hex = (value >>> 0).toString(16).toUpperCase().padStart(bytes * 2, "0");
  return `0x${hex}`;
}

/** Format a single byte for the hex-stream inspector, e.g. 12 -> "12". */
export function formatByte(byte) {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

/** Format an epoch tick counter with thousands separators. */
export function formatTicks(ticks) {
  if (ticks === null || ticks === undefined) return "nan";
  return `${Number(ticks).toLocaleString("en-US")} msec`;
}

/** Resolve a numeric value against configured limits -> status keyword. */
export function resolveLimitStatus(value, limits, validRange = null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "raw";

  // Valid physical range (minValue / maxValue): outside it the reading is impossible -> "invalid"
  if (validRange && typeof validRange === "object") {
    const n = Number(value);
    const has = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
    if ((has(validRange.minValue) && n < Number(validRange.minValue)) || (has(validRange.maxValue) && n > Number(validRange.maxValue))) {
      return "invalid";
    }
  }
  if (!limits) return "nominal";

  const num = Number(value);

  // Explicit statusRanges model
  // Explicit statusRanges model
  if (limits.statusRanges && typeof limits.statusRanges === "object") {
    const { normal, critical, warning } = limits.statusRanges;
    const isValidBound = (val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "string" && val.trim() === "") return false;
      const n = Number(val);
      return Number.isFinite(n);
    };
    const hasConfiguredRange = (rng) => {
      if (!rng || typeof rng !== "object") return false;
      return isValidBound(rng.min) || isValidBound(rng.max);
    };

    const hasNormal = hasConfiguredRange(normal);
    const hasWarning = hasConfiguredRange(warning);
    const hasCritical = hasConfiguredRange(critical);

    if (hasNormal || hasWarning || hasCritical) {
      const inRange = (rng) => {
        if (!rng || typeof rng !== "object") return false;
        const { min, max } = rng;
        const hasMin = isValidBound(min);
        const hasMax = isValidBound(max);
        if (!hasMin && !hasMax) return false;
        const numMin = hasMin ? Number(min) : -Infinity;
        const numMax = hasMax ? Number(max) : Infinity;
        return num >= numMin && num <= numMax;
      };

      // 1. NORMAL range has top precedence on shared boundaries
      if (inRange(normal)) return "nominal";
      // 2. WARNING range (optional)
      if (inRange(warning)) return "warning";
      // 3. CRITICAL range
      if (inRange(critical)) return "alarm";
      // 4. Outside configured ranges
      return "raw";
    }
  }

  // Legacy fallback
  const { alarmLow, warnLow, warnHigh, alarmHigh } = limits;
  if (
    (alarmLow !== undefined && alarmLow !== null && alarmLow !== "" && num <= Number(alarmLow)) ||
    (alarmHigh !== undefined && alarmHigh !== null && alarmHigh !== "" && num >= Number(alarmHigh))
  ) {
    return "alarm";
  }
  if (
    (warnLow !== undefined && warnLow !== null && warnLow !== "" && num <= Number(warnLow)) ||
    (warnHigh !== undefined && warnHigh !== null && warnHigh !== "" && num >= Number(warnHigh))
  ) {
    return "warning";
  }
  return "nominal";
}

/** Human labels for the semantic status keywords. */
export const STATUS_LABELS = {
  nominal: "NOMINAL",
  warning: "WARNING",
  alarm: "ALARM",
  invalid: "INVALID",
  raw: "RAW",
};

/** Normalize backend status values for filtering and chart display. */
export function toStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return "nominal";
  if (value.includes("alarm") || value.includes("critical") || value === "danger") return "alarm";
  if (value.includes("warning") || value.includes("warn")) return "warning";
  if (value === "invalid") return "invalid";
  if (value === "raw") return "raw";
  return "nominal";
}

export function formatDateTime(date) {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) return typeof date === "string" ? date : "—";
  return d.toLocaleString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


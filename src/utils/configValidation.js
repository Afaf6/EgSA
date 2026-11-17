import { normalizeDecimalString } from './statusRepresentationHelper';

const TYPE_SIZES = { 8: 1, 16: 2, 32: 4, 64: 8 };

/** Bytes a BYTE-mode parameter reads: its length, but never less than its data type needs. */
function byteSpan(row) {
  const dt = String(row.dataType || "").toUpperCase();
  const bits = dt.match(/(8|16|32|64)/)?.[1];
  const typeSize = dt.startsWith("FLOAT") && !bits ? 4 : (dt === "DOUBLE" ? 8 : (TYPE_SIZES[bits] || 1));
  const len = Number(row.length ?? row.byteLength);
  return Math.max(Number.isFinite(len) && len > 0 ? len : 0, typeSize);
}

/**
 * The frame's CRC bytes as absolute [start, end) offsets, resolved like the server does for
 * BIT parameters (utils/parameterOverlap.js): negative offsets count from the frame end, a
 * missing offset means the last bytes. Null when the frame has no CRC or it can not be placed.
 */
export function frameCrcRange(frame) {
  if (!frame || frame.hasCrc === false) return null;
  const crc = frame.crc || frame.layout?.crc;
  if (!crc || crc.enabled === false || String(crc.algorithm || "").toLowerCase() === "none") return null;
  const total = Number(frame.totalFrameLength ?? frame.frameLength ?? frame.layout?.totalLength);
  const hasTotal = Number.isFinite(total) && total > 0;
  const length = Number(crc.length) > 0 ? Number(crc.length) : (Number(crc.width) > 0 ? Math.ceil(Number(crc.width) / 8) : null);
  if (!length) return null;
  const off = crc.offset === "" || crc.offset === null || crc.offset === undefined ? null : Number(crc.offset);
  let start = null;
  if (Number.isFinite(off)) start = off >= 0 ? off : (hasTotal ? total + off : null);
  else if (hasTotal) start = total - length;
  return start === null ? null : { start, end: start + length };
}

/**
 * Checks parameters against the frame's fixed regions. options.frame: the frame being edited
 * (payloadBaseOffset, totalFrameLength, crc, hasCrc). options.storedParams: the parameters as
 * stored, so a location that was already saved is only warned about, not refused.
 */
function checkFrameRegions(rows, options, errors, warnings) {
  const frame = options.frame;
  if (!frame) return;
  const base = Number(frame.payloadBaseOffset ?? frame.baseOffset ?? frame.payloadOffset ?? 0) || 0;
  const total = Number(frame.totalFrameLength ?? frame.frameLength);
  const crc = frameCrcRange(frame);
  const stored = new Map((options.storedParams || []).map((p) => [String(p._id || p.id), p]));

  rows.forEach((row, idx) => {
    const rowLabel = row.name || `Row ${idx + 1}`;
    const offset = Number(row.byteOffset);
    if (row.byteOffset === "" || row.byteOffset === null || !Number.isFinite(offset)) return;
    const start = base + offset;
    const end = start + byteSpan(row);
    if (Number.isFinite(total) && total > 0 && end > total) {
      const message = `${rowLabel}: bytes ${start}..${end - 1} go past the end of the ${total}-byte frame.`;
      const was = stored.get(String(row._id || row.id));
      const unchanged = was && Number(was.byteOffset) === offset && byteSpan(was) === byteSpan(row);
      if (unchanged) warnings.push(`${message} (already saved this way)`);
      else errors.push(message);
      return;
    }
    if (crc && start < crc.end && crc.start < end) {
      const message = `${rowLabel}: bytes ${start}..${end - 1} overlap the frame's CRC bytes ${crc.start}..${crc.end - 1}.`;
      const was = stored.get(String(row._id || row.id));
      const unchanged = was && Number(was.byteOffset) === offset && byteSpan(was) === byteSpan(row);
      // A location already saved stays saveable (some configurations read the CRC on purpose).
      if (unchanged) warnings.push(`${message} (already saved this way)`);
      else errors.push(message);
    }
  });
}

/** First payload offset at or after `from` where `size` bytes avoid the frame's CRC bytes. */
export function skipCrcBytes(from, size, frame) {
  const crc = frameCrcRange(frame);
  if (!crc) return from;
  const base = Number(frame.payloadBaseOffset ?? 0) || 0;
  const start = base + from;
  return start < crc.end && crc.start < start + size ? crc.end - base : from;
}

/** Validates a parameter schema table before it can be activated. */
export function validateSchema(rows, options = {}) {
  const dataRepresentation = options?.dataRepresentation || "BYTE";
  const isBitMode = String(dataRepresentation).toUpperCase() === "BIT";
  const errors = [];
  const warnings = [];
  if (!isBitMode) checkFrameRegions(rows, options, errors, warnings);
  const seenNames = new Set();
  const seenLocations = new Map();

  rows.forEach((row, idx) => {
    const rowLabel = row.name || `Row ${idx + 1}`;

    if (!row.name || !row.name.trim()) {
      errors.push(`${rowLabel}: name is required.`);
    } else if (seenNames.has(row.name)) {
      errors.push(`${rowLabel}: duplicate parameter name.`);
    } else {
      seenNames.add(row.name);
    }

    if (isBitMode) {
      const bitOff = row.bitOffset;
      if (bitOff === "" || bitOff === null || bitOff === undefined || Number.isNaN(Number(bitOff)) || Number(bitOff) < 0 || !Number.isInteger(Number(bitOff))) {
        errors.push(`${rowLabel}: bit offset must be a non-negative integer.`);
      }
      const bitLen = row.bitLength;
      if (bitLen === "" || bitLen === null || bitLen === undefined || Number.isNaN(Number(bitLen)) || Number(bitLen) < 1 || Number(bitLen) > 64 || !Number.isInteger(Number(bitLen))) {
        errors.push(`${rowLabel}: bit length must be an integer between 1 and 64.`);
      }
      if (row.byteOffset !== "" && row.byteOffset !== null && row.byteOffset !== undefined && (Number.isNaN(Number(row.byteOffset)) || Number(row.byteOffset) < 0)) {
        errors.push(`${rowLabel}: byte offset must be a non-negative number.`);
      }
      const len = row.length ?? row.byteLength;
      if (len !== "" && len !== null && len !== undefined && (Number.isNaN(Number(len)) || Number(len) <= 0)) {
        errors.push(`${rowLabel}: length must be greater than 0.`);
      }
    } else {
      if (row.byteOffset === "" || row.byteOffset === null || Number.isNaN(Number(row.byteOffset))) {
        errors.push(`${rowLabel}: byte offset must be a number.`);
      }
      const len = row.length ?? row.byteLength;
      if (len === undefined || len === null || len === "" || Number(len) <= 0) {
        errors.push(`${rowLabel}: length must be greater than 0.`);
      }
    }

    const hasNum = (v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v));
    if (hasNum(row.minValue) && hasNum(row.maxValue) && Number(row.minValue) > Number(row.maxValue)) {
      errors.push(`${rowLabel}: Valid Min must be <= Valid Max.`);
    }
    if (!row.dataType) {
      errors.push(`${rowLabel}: data type is required.`);
    }

    // Check duplicate parameter locations
    let locKey = null;
    let locDesc = null;
    if (isBitMode) {
      const bitOff = row.bitOffset !== "" && row.bitOffset !== null && row.bitOffset !== undefined && !Number.isNaN(Number(row.bitOffset))
        ? Number(row.bitOffset)
        : null;
      if (bitOff !== null) {
        locKey = `bit_${bitOff}`;
        locDesc = `byteOffset ${Math.floor(bitOff / 8)}, bitOffset ${bitOff}`;
      }
    } else {
      const bOff = row.byteOffset !== "" && row.byteOffset !== null && row.byteOffset !== undefined && !Number.isNaN(Number(row.byteOffset))
        ? Number(row.byteOffset)
        : null;
      const bitOff = row.bitOffset !== "" && row.bitOffset !== null && row.bitOffset !== undefined && !Number.isNaN(Number(row.bitOffset))
        ? Number(row.bitOffset)
        : null;
      if (bOff !== null) {
        locKey = `${bOff}:${bitOff ?? 'null'}`;
        locDesc = `byteOffset ${bOff}${bitOff !== null ? `, bitOffset ${bitOff}` : ''}`;
      }
    }

    if (locKey) {
      if (seenLocations.has(locKey)) {
        errors.push(`Duplicate parameter definition at ${locDesc}: "${seenLocations.get(locKey)}" and "${rowLabel}" occupy the same location.`);
      } else {
        seenLocations.set(locKey, rowLabel);
      }
    }

    // ── Status Ranges Validation (New Model) ──────────────────────────────
    const sr = row.statusRanges || {
      normal: { min: row.normalMin, max: row.normalMax },
      critical: { min: row.criticalMin, max: row.criticalMax },
      warning: { min: row.warningMin, max: row.warningMax },
    };

    const hasStatusRanges =
      (sr.normal && (sr.normal.min !== "" && sr.normal.min !== null && sr.normal.min !== undefined || sr.normal.max !== "" && sr.normal.max !== null && sr.normal.max !== undefined)) ||
      (sr.critical && (sr.critical.min !== "" && sr.critical.min !== null && sr.critical.min !== undefined || sr.critical.max !== "" && sr.critical.max !== null && sr.critical.max !== undefined)) ||
      (sr.warning && (sr.warning.min !== "" && sr.warning.min !== null && sr.warning.min !== undefined || sr.warning.max !== "" && sr.warning.max !== null && sr.warning.max !== undefined));

    if (hasStatusRanges) {
      const ranges = [
        { name: "NORMAL", r: sr.normal },
        { name: "CRITICAL", r: sr.critical },
        { name: "WARNING", r: sr.warning },
      ];

      for (const item of ranges) {
        if (!item.r) continue;
        const { min, max } = item.r;
        if (min !== "" && min !== null && min !== undefined && (Number.isNaN(Number(min)) || typeof min === "boolean")) {
          errors.push(`${rowLabel}: ${item.name} min must be numeric.`);
        }
        if (max !== "" && max !== null && max !== undefined && (Number.isNaN(Number(max)) || typeof max === "boolean")) {
          errors.push(`${rowLabel}: ${item.name} max must be numeric.`);
        }
        const nMin = min !== "" && min !== null && min !== undefined && !Number.isNaN(Number(min)) ? Number(min) : null;
        const nMax = max !== "" && max !== null && max !== undefined && !Number.isNaN(Number(max)) ? Number(max) : null;
        if (nMin !== null && nMax !== null && nMin > nMax) {
          errors.push(`${rowLabel}: ${item.name} min (${min}) must be smaller than or equal to max (${max}).`);
        }
      }

      // Check interior overlaps between defined ranges
      const active = ranges
        .filter((x) => x.r && ((x.r.min !== "" && x.r.min !== null && x.r.min !== undefined && !Number.isNaN(Number(x.r.min))) ||
                               (x.r.max !== "" && x.r.max !== null && x.r.max !== undefined && !Number.isNaN(Number(x.r.max)))))
        .map((x) => ({
          name: x.name,
          min: x.r.min !== "" && x.r.min !== null && x.r.min !== undefined && !Number.isNaN(Number(x.r.min)) ? Number(x.r.min) : -Infinity,
          max: x.r.max !== "" && x.r.max !== null && x.r.max !== undefined && !Number.isNaN(Number(x.r.max)) ? Number(x.r.max) : Infinity,
        }));

      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i];
          const b = active[j];
          const overlapMin = Math.max(a.min, b.min);
          const overlapMax = Math.min(a.max, b.max);
          if (overlapMin < overlapMax) {
            errors.push(`${rowLabel}: Range overlap constraint violated: ${a.name} [${a.min}, ${a.max}] overlaps with ${b.name} [${b.min}, ${b.max}].`);
          }
        }
      }
    } else {
      // ── Legacy Concentric Thresholds Validation (Fallback) ───────────────
      const alRaw = row.alarmLow;
      const ahRaw = row.alarmHigh;
      const wlRaw = row.warnLow;
      const whRaw = row.warnHigh;

      if (alRaw !== "" && alRaw !== null && alRaw !== undefined && (Number.isNaN(Number(alRaw)) || typeof alRaw === "boolean")) {
        errors.push(`${rowLabel}: "Critical if below" must be numeric.`);
      }
      if (ahRaw !== "" && ahRaw !== null && ahRaw !== undefined && (Number.isNaN(Number(ahRaw)) || typeof ahRaw === "boolean")) {
        errors.push(`${rowLabel}: "Critical if above" must be numeric.`);
      }
      if (wlRaw !== "" && wlRaw !== null && wlRaw !== undefined && (Number.isNaN(Number(wlRaw)) || typeof wlRaw === "boolean")) {
        errors.push(`${rowLabel}: "Warn Low" must be numeric.`);
      }
      if (whRaw !== "" && whRaw !== null && whRaw !== undefined && (Number.isNaN(Number(whRaw)) || typeof whRaw === "boolean")) {
        errors.push(`${rowLabel}: "Warn High" must be numeric.`);
      }

      const alarmLow = (alRaw === "" || alRaw === null || alRaw === undefined || Number.isNaN(Number(alRaw))) ? null : Number(alRaw);
      const alarmHigh = (ahRaw === "" || ahRaw === null || ahRaw === undefined || Number.isNaN(Number(ahRaw))) ? null : Number(ahRaw);
      const warnLow = (wlRaw === "" || wlRaw === null || wlRaw === undefined || Number.isNaN(Number(wlRaw))) ? null : Number(wlRaw);
      const warnHigh = (whRaw === "" || whRaw === null || whRaw === undefined || Number.isNaN(Number(whRaw))) ? null : Number(whRaw);

      if (alarmLow !== null && alarmHigh !== null && alarmLow >= alarmHigh) {
        errors.push(`${rowLabel}: "Critical if below" must be smaller than "Critical if above".`);
      }

      if (alarmLow !== null && warnLow !== null && alarmLow > warnLow) {
        errors.push(`${rowLabel}: alarm-low limit should not be above warn-low limit.`);
      }
      if (alarmHigh !== null && warnHigh !== null && alarmHigh < warnHigh) {
        errors.push(`${rowLabel}: alarm-high limit should not be below warn-high limit.`);
      }
    }

    // ── Status Representation (DECIMAL ONLY) Validation ──────────────────
    if (Array.isArray(row.statusRepresentation) && row.statusRepresentation.length > 0) {
      const seenRaw = new Set();
      row.statusRepresentation.forEach((mapping, mIdx) => {
        if (!mapping || typeof mapping !== 'object') {
          return;
        }
        const raw = String(mapping.rawValue ?? '').trim();
        const status = String(mapping.status ?? '').trim();
        if (!raw) {
          errors.push(`${rowLabel}: status representation item #${mIdx + 1} rawValue is required.`);
        } else if (!/^-?\d+(\.\d+)?$/.test(raw)) {
          errors.push(`${rowLabel}: status representation rawValue '${raw}' must be a valid decimal number. Binary or hexadecimal formats are not supported.`);
        } else {
          const norm = normalizeDecimalString(raw);
          if (!norm) {
            errors.push(`${rowLabel}: invalid decimal rawValue '${raw}'.`);
          } else if (seenRaw.has(norm)) {
            errors.push(`${rowLabel}: duplicate decimal rawValue '${raw}' in status representation.`);
          } else {
            seenRaw.add(norm);
          }
        }
        if (!status) {
          errors.push(`${rowLabel}: status representation item #${mIdx + 1} status label cannot be empty.`);
        }
      });
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

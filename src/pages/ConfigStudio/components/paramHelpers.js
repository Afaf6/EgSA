// Shared helpers for the Parameter table, details panel and edit modal.
import { NEW_PARAMETER_ENCODING } from "./parameterTypeFields";

export const isBlank = (v) => v === "" || v === null || v === undefined;

export function hasWarnValues(row) {
  return !isBlank(row.warnLow) || !isBlank(row.warnHigh);
}

// Hex "ID" column: use a real id from the backend if it is short, otherwise the row position.
export function paramHexId(row, idx) {
  const raw = row.parameterId ?? row.paramId ?? row.paramCode;
  if (raw !== undefined && raw !== null && String(raw).length <= 6) {
    const s = String(raw);
    return /^0x/i.test(s) ? s : /^[0-9a-f]+$/i.test(s) && isNaN(Number(s)) ? `0x${s.toUpperCase()}` : `0x${Number(s).toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return `0x${(idx + 1).toString(16).toUpperCase().padStart(2, "0")}`;
}

export const endianLabel = (e) => (e === "BE" ? "Big Endian" : e === "LE" ? "Little Endian" : e || "-");

export function newParameter() {
  return {
    // Empty on purpose: the Add Parameter modal requires a name, so no placeholder name is saved.
    name: "",
    byteOffset: 0,
    bitOffset: null,
    bitLength: null,
    length: 1,
    // Stored shape (see parameterTypeFields.js): the strings "unsigned"/"BE" used before were
    // read by the server as signed=true and were never stored as an endianness.
    ...NEW_PARAMETER_ENCODING,
    scale: 1,
    offset: 0,
    minValue: "",
    maxValue: "",
    equation: "",
    enabled: true,
    unit: "",
    statusRanges: {
      normal: { min: "", max: "" },
      critical: { min: "", max: "" },
      warning: { min: "", max: "" },
    },
  };
}

// Read the three status ranges from whichever shape the row uses (new statusRanges or legacy fields).
export function readStatusRanges(row) {
  const sr = row.statusRanges || row.limits?.statusRanges;
  const pick = (k) => ({
    min: sr?.[k]?.min ?? row[`${k}Min`] ?? "",
    max: sr?.[k]?.max ?? row[`${k}Max`] ?? "",
  });
  return { normal: pick("normal"), critical: pick("critical"), warning: pick("warning") };
}

export function getLimitsPreview(alarmLow, alarmHigh) {
  const hasLow =
    alarmLow !== undefined &&
    alarmLow !== null &&
    alarmLow !== "" &&
    !isNaN(Number(alarmLow));
  const hasHigh =
    alarmHigh !== undefined &&
    alarmHigh !== null &&
    alarmHigh !== "" &&
    !isNaN(Number(alarmHigh));

  if (hasLow && hasHigh) {
    const low = Number(alarmLow);
    const high = Number(alarmHigh);
    if (low >= high) {
      return ['Invalid: "Critical if below" must be smaller than "Critical if above"'];
    }
    return [
      `Below ${alarmLow}: Critical`,
      `${alarmLow} to ${alarmHigh}: Normal`,
      `Above ${alarmHigh}: Critical`,
    ];
  }

  if (hasLow) {
    return [
      `Below ${alarmLow}: Critical`,
      `${alarmLow} and above: Normal`,
    ];
  }

  if (hasHigh) {
    return [
      `${alarmHigh} and below: Normal`,
      `Above ${alarmHigh}: Critical`,
    ];
  }

  return ["No limits configured (Normal)"];
}

export function getStatusRangesPreview(row) {
  const sr = row.statusRanges || row.limits?.statusRanges || {
    normal: { min: row.normalMin ?? row.limits?.statusRanges?.normal?.min, max: row.normalMax ?? row.limits?.statusRanges?.normal?.max },
    critical: { min: row.criticalMin ?? row.limits?.statusRanges?.critical?.min, max: row.criticalMax ?? row.limits?.statusRanges?.critical?.max },
    warning: { min: row.warningMin ?? row.limits?.statusRanges?.warning?.min, max: row.warningMax ?? row.limits?.statusRanges?.warning?.max },
  };

  const getBound = (r) => {
    if (!r) return null;
    const hasMin = r.min !== "" && r.min !== null && r.min !== undefined && !Number.isNaN(Number(r.min));
    const hasMax = r.max !== "" && r.max !== null && r.max !== undefined && !Number.isNaN(Number(r.max));
    if (!hasMin && !hasMax) return null;
    return {
      min: hasMin ? Number(r.min) : -Infinity,
      max: hasMax ? Number(r.max) : Infinity,
      rawMin: r.min,
      rawMax: r.max,
      hasMin,
      hasMax,
    };
  };

  const norm = getBound(sr.normal);
  const crit = getBound(sr.critical);
  const warn = getBound(sr.warning);

  if (!norm && !crit && !warn) {
    return ["No status ranges configured (default: NORMAL)"];
  }

  const lines = [];

  // NORMAL Range
  if (norm) {
    lines.push(`NORMAL: [${norm.hasMin ? norm.rawMin : "-∞"}, ${norm.hasMax ? norm.rawMax : "+∞"}]`);
  }

  // WARNING Range (Optional)
  if (warn) {
    const sharesLowerWithNormal = norm && warn.hasMin && norm.hasMax && warn.min === norm.max;
    const sharesUpperWithNormal = norm && warn.hasMax && norm.hasMin && warn.max === norm.min;
    const left = sharesLowerWithNormal ? "(" : "[";
    const right = sharesUpperWithNormal ? ")" : "]";
    lines.push(`WARNING: ${left}${warn.hasMin ? warn.rawMin : "-∞"}, ${warn.hasMax ? warn.rawMax : "+∞"}${right}`);
  }

  // CRITICAL Range
  if (crit) {
    const sharesLowerWithHigher =
      (norm && crit.hasMin && norm.hasMax && crit.min === norm.max) ||
      (warn && crit.hasMin && warn.hasMax && crit.min === warn.max);
    const sharesUpperWithHigher =
      (norm && crit.hasMax && norm.hasMin && crit.max === norm.min) ||
      (warn && crit.hasMax && warn.hasMin && crit.max === warn.min);
    const left = sharesLowerWithHigher ? "(" : "[";
    const right = sharesUpperWithHigher ? ")" : "]";
    lines.push(`CRITICAL: ${left}${crit.hasMin ? crit.rawMin : "-∞"}, ${crit.hasMax ? crit.rawMax : "+∞"}${right}`);
  }

  lines.push("Outside configured ranges: UNKNOWN");
  return lines;
}

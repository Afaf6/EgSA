// Plain-text (.txt) format for TLM parameter / frame configuration files.
//
//   # Lines starting with '#' are comments; blank lines are ignored.
//   frame_name: Frame_1
//   frame_length: 32
//   header_length: 4
//   header_pattern: 1A 2B 3C 4D
//   routing_id_offset: 2
//
//   # One parameter per line, comma-separated:
//   # name, byteOffset, bitOffset, length, dataType, signed, endianness, scale, offset, unit, warnLow, alarmLow, warnHigh, alarmHigh
//   param_temp, 8, 0, 2, int16, signed, BE, 0.1, 0, °C, -20, -30, 55, 70
//
// Only the first 5 columns are required; the rest fall back to defaults
// (unsigned, LE, scale 1, offset 0, no unit, no limits).

import { DATA_TYPES } from "../constants/telemetryConstants";

export const PARAM_COLUMNS = [
  "name", "byteOffset", "bitOffset", "length", "dataType", "signed", "endianness",
  "scale", "offset", "unit", "warnLow", "alarmLow", "warnHigh", "alarmHigh",
];

// text key -> field name
export const META_KEYS = {
  frame_name: "frameName",
  frame_length: "frameLength",
  header_length: "headerLength",
  header_pattern: "headerPattern",
  routing_id_offset: "routingIdOffset",
  delimiter_pattern: "delimiterPattern",
  delimiter_offset: "delimiterOffset",
  protocol_name: "protocolName",
  checksum_type: "checksumType",
  byte_order: "byteOrder",
  sync_pattern: "syncPattern",
  subsystem_code: "subsystemCode",
  subsystem_name: "subsystemName",
};
const NUMERIC_META = ["frameLength", "headerLength", "routingIdOffset", "delimiterOffset"];
const NUMERIC_COLS = ["byteOffset", "bitOffset", "length", "scale", "offset"];
const LIMIT_COLS = ["warnLow", "alarmLow", "warnHigh", "alarmHigh"];

const isNum = (v) => v !== "" && !Number.isNaN(Number(v));

/** Parses the text format. Returns { meta, parameters, errors } — bad lines are reported, not thrown. */
export function parseConfigText(text) {
  const meta = {};
  const parameters = [];
  const errors = [];
  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");

  cleanText.split(/\r?\n/).forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;

    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase().replace(/\s+/g, "_");
      if (META_KEYS[key]) {
        const field = META_KEYS[key];
        const value = line.slice(colon + 1).trim();
        if (NUMERIC_META.includes(field)) {
          if (!isNum(value)) errors.push(`Line ${lineNo}: "${key}" must be a number.`);
          else meta[field] = Number(value);
        } else {
          meta[field] = value;
        }
        return;
      }
    }

    // Accept comma, semicolon, tab or pipe separated parameter files.
    const separator = line.includes(",") ? "," : line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes("|") ? "|" : null;
    if (!separator) {
      errors.push(`Line ${lineNo}: unsupported format. Use comma-, tab-, semicolon- or pipe-separated parameter data.`);
      return;
    }

    const cols = line.split(separator).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    if (cols.length < 5) {
      errors.push(`Line ${lineNo}: expected at least 5 values (name, byteOffset, bitOffset, length, dataType).`);
      return;
    }
    if (cols.length > PARAM_COLUMNS.length) {
      errors.push(`Line ${lineNo}: too many values (${cols.length}); a parameter has at most ${PARAM_COLUMNS.length}.`);
      return;
    }

    const row = {
      name: "", byteOffset: 0, bitOffset: 0, length: 1, dataType: "uint8", signed: "unsigned",
      endianness: "LE", scale: 1, offset: 0, unit: "", warnLow: "", alarmLow: "", warnHigh: "", alarmHigh: "",
    };

    cols.forEach((value, idx) => {
      row[PARAM_COLUMNS[idx]] = value;
    });

    const problems = [];
    if (!row.name) problems.push("name is empty");
    NUMERIC_COLS.forEach((key) => {
      if (!isNum(String(row[key]))) problems.push(`${key} must be a number`);
      else row[key] = Number(row[key]);
    });
    LIMIT_COLS.forEach((key) => {
      if (row[key] === "") return;
      if (!isNum(String(row[key]))) problems.push(`${key} must be a number or blank`);
      else row[key] = Number(row[key]);
    });
    const cleanDt = String(row.dataType || "").trim().toUpperCase();
    if (!DATA_TYPES.includes(cleanDt)) {
      problems.push(`unknown data type "${row.dataType}" (use ${DATA_TYPES.join(", ")})`);
    } else {
      row.dataType = cleanDt;
    }
    if (!["signed", "unsigned"].includes(row.signed)) problems.push(`signed must be "signed" or "unsigned"`);
    if (!["LE", "BE"].includes(row.endianness)) problems.push(`endianness must be "LE" or "BE"`);

    if (problems.length) errors.push(`Line ${lineNo} (${row.name || "?"}): ${problems.join("; ")}.`);
    else parameters.push(row);
  });

  return { meta, parameters, errors };
}

/** Serialises meta + parameters back into the text format above. */
export function formatConfigText({ meta = {}, parameters = [] }) {
  const lines = ["# TLM configuration — plain text", "# Lines starting with '#' are comments.", ""];
  Object.entries(META_KEYS).forEach(([key, field]) => {
    if (meta[field] !== undefined && meta[field] !== "") lines.push(`${key}: ${meta[field]}`);
  });
  lines.push("", `# ${PARAM_COLUMNS.join(", ")}`);
  parameters.forEach((p) => lines.push(PARAM_COLUMNS.map((c) => p[c] ?? "").join(", ")));
  return lines.join("\n") + "\n";
}

/** A neutral template example users can download and edit. */
export function buildTemplateText() {
  return formatConfigText({
    meta: {
      frameName: "Frame_1", frameLength: 32, headerLength: 4, headerPattern: "1A 2B 3C 4D",
      routingIdOffset: 2,
    },
    parameters: [
      { name: "voltage", byteOffset: 4, bitOffset: 0, length: 2, dataType: "uint16", signed: "unsigned", endianness: "BE", scale: 0.01, offset: 0, unit: "V", warnLow: 24, alarmLow: 21, warnHigh: 30.5, alarmHigh: 32 },
      { name: "temperature", byteOffset: 6, bitOffset: 0, length: 2, dataType: "int16", signed: "signed", endianness: "BE", scale: 0.1, offset: 0, unit: "°C", warnLow: -20, alarmLow: -30, warnHigh: 55, alarmHigh: 70 },
    ],
  });
}

import { useState, useMemo } from "react";
import { DATA_TYPES } from "../../../constants/telemetryConstants";
import {
  UNIT_CATEGORIES,
  ALL_STANDARD_UNITS,
} from "../../../utils/unitConversion";
import { validateSchema } from "../../../utils/configValidation";
import { describeEncoding, applyEncodingChange, hasByteOrder, hasSignedness, NEW_PARAMETER_ENCODING } from "./parameterTypeFields";
import { Check, X, Search, Trash2, Plus, FileCode, Save } from "lucide-react";

const BYTE_TEXT_COLUMNS = [
  { key: "byteOffset", label: "Byte Offset", minWidth: 90, width: 95 },
  { key: "bitOffset", label: "Bit Offset", minWidth: 85, width: 90 },
  { key: "length", label: "Length", minWidth: 80, width: 85 },
];

const BIT_TEXT_COLUMNS = [
  { key: "bitOffset", label: "Bit Offset", minWidth: 85, width: 90 },
  { key: "bitLength", label: "Bit Length", minWidth: 85, width: 90 },
  { key: "byteOffset", label: "Byte Offset (Derived)", minWidth: 100, width: 110 },
  { key: "length", label: "Byte Span (Derived)", minWidth: 95, width: 105 },
];

const CALIBRATION_COLUMNS = [
  { key: "scale", label: "Scale", minWidth: 95, width: 100 },
  { key: "offset", label: "Offset", minWidth: 95, width: 100 },
  { key: "minValue", label: "Valid Min", minWidth: 95, width: 100 },
  { key: "maxValue", label: "Valid Max", minWidth: 95, width: 100 },
];

function hasWarnValues(row) {
  return (
    (row.warnLow !== "" && row.warnLow !== null && row.warnLow !== undefined) ||
    (row.warnHigh !== "" && row.warnHigh !== null && row.warnHigh !== undefined)
  );
}

function getLimitsPreview(alarmLow, alarmHigh) {
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

function getStatusRangesPreview(row) {
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

export function getDataTypeByteSize(dataType, fallbackLength = 1) {
  if (!dataType) return Number(fallbackLength) || 1;
  const dt = String(dataType).toLowerCase().trim();
  if (dt.includes("64") || dt === "double") return 8;
  if (dt.includes("32") || dt === "float") return 4;
  if (dt.includes("16")) return 2;
  if (dt.includes("8") || dt === "bool" || dt === "enum") return 1;
  return Number(fallbackLength) || 1;
}

export function computeNextFreeByteOffset(rows = []) {
  let highestOccupiedEnd = 0;
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r && r.byteOffset !== undefined && r.byteOffset !== null && r.byteOffset !== "") {
        const offset = Number(r.byteOffset);
        if (!isNaN(offset) && offset >= 0) {
          const size = getDataTypeByteSize(r.dataType, r.length ?? r.byteLength ?? 1);
          const end = offset + size;
          if (end > highestOccupiedEnd) {
            highestOccupiedEnd = end;
          }
        }
      }
    }
  }
  return highestOccupiedEnd;
}

let newRowSeq = 0;

export default function ParameterSchemaTable({
  rows = [],
  onChange,
  onSave = null,
  isSaving = false,
  dataRepresentation = "BYTE",
}) {
  const isBitMode = String(dataRepresentation).toUpperCase() === "BIT";
  const [customEditingRowIdx, setCustomEditingRowIdx] = useState(null);
  const [customInputVal, setCustomInputVal] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [saveError, setSaveError] = useState(null);

  const updateRow = (targetRowIdx, patch) => {
    if (saveError) setSaveError(null);
    const next = rows.map((row, i) => (i === targetRowIdx ? { ...row, ...patch } : row));
    onChange(next);
  };

  const updateCell = (targetRowIdx, key, value) => {
    updateRow(targetRowIdx, { [key]: value });
  };

  const updateStatusRange = (targetRowIdx, status, bound, value) => {
    if (saveError) setSaveError(null);
    const targetRow = rows[targetRowIdx];
    const currentSR = targetRow.statusRanges || targetRow.limits?.statusRanges || {
      normal: {
        min: targetRow.normalMin ?? targetRow.limits?.statusRanges?.normal?.min ?? "",
        max: targetRow.normalMax ?? targetRow.limits?.statusRanges?.normal?.max ?? "",
      },
      critical: {
        min: targetRow.criticalMin ?? targetRow.limits?.statusRanges?.critical?.min ?? "",
        max: targetRow.criticalMax ?? targetRow.limits?.statusRanges?.critical?.max ?? "",
      },
      warning: {
        min: targetRow.warningMin ?? targetRow.limits?.statusRanges?.warning?.min ?? "",
        max: targetRow.warningMax ?? targetRow.limits?.statusRanges?.warning?.max ?? "",
      },
    };

    const newSR = {
      ...currentSR,
      [status]: {
        ...(currentSR[status] || {}),
        [bound]: value,
      },
    };

    const next = rows.map((r, i) =>
      i === targetRowIdx
        ? {
          ...r,
          statusRanges: newSR,
          limits: {
            ...(r.limits || {}),
            statusRanges: newSR,
          },
          [`${status}Min`]: bound === "min" ? value : (r[`${status}Min`] ?? newSR[status]?.min),
          [`${status}Max`]: bound === "max" ? value : (r[`${status}Max`] ?? newSR[status]?.max),
        }
        : r
    );
    onChange(next);
  };

  const handleSaveClick = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const result = validateSchema(rows, { dataRepresentation });
    if (!result.valid) {
      setSaveError(result.errors.join("; "));
      return;
    }
    setSaveError(null);
    if (onSave) onSave();
  };

  const addRow = () => {
    newRowSeq += 1;
    setSearchQuery(""); // Clear search filter so the newly added row is visible at the top
    const nextOffset = computeNextFreeByteOffset(rows);
    let nextBitOffset = 0;
    if (isBitMode) {
      for (const r of rows) {
        if (r && r.bitOffset !== undefined && r.bitOffset !== null && r.bitOffset !== "") {
          const off = Number(r.bitOffset);
          const len = Number(r.bitLength) || 8;
          if (!isNaN(off) && off >= 0) {
            nextBitOffset = Math.max(nextBitOffset, off + len);
          }
        }
      }
    }
    onChange([
      {
        name: `new_param_${newRowSeq}`,
        byteOffset: isBitMode ? Math.floor(nextBitOffset / 8) : nextOffset,
        bitOffset: isBitMode ? nextBitOffset : 0,
        bitLength: 8,
        length: 1,
        // Stored shape (see parameterTypeFields.js), not the "unsigned"/"LE" strings.
        ...NEW_PARAMETER_ENCODING,
        scale: 1,
        offset: 0,
        minValue: "",
        maxValue: "",
        enabled: true,
        unit: "",
        statusRanges: {
          normal: { min: "", max: "" },
          critical: { min: "", max: "" },
          warning: { min: "", max: "" },
        },
      },
      ...rows,
    ]);
  };

  const deleteRow = (targetRowIdx) => {
    if (rows.length <= 1) {
      alert("A frame must contain at least one parameter. Cannot delete the only remaining parameter.");
      return;
    }
    onChange(rows.filter((_, i) => i !== targetRowIdx));
  };

  // Filter rows while preserving original index mapping for safe mutations
  const filteredRows = useMemo(() => {
    const indexed = rows.map((row, idx) => ({ ...row, _origIdx: idx }));
    if (!searchQuery.trim()) return indexed;

    const q = searchQuery.toLowerCase().trim();
    return indexed.filter(
      (r) =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.dataType && r.dataType.toLowerCase().includes(q)) ||
        (r.unit && r.unit.toLowerCase().includes(q)) ||
        String(r.byteOffset).includes(q)
    );
  }, [rows, searchQuery]);

  return (
    <div className="egse-panel">
      {/* Table Header Bar */}
      <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <h3 className="egse-panel-title mb-0 d-flex align-items-center gap-2">
            <span> Parameter Schema</span>
          </h3>
          <span className="badge bg-dark border border-secondary text-muted" style={{ fontSize: "0.74rem" }}>
            {rows.length} parameter{rows.length !== 1 ? "s" : ""}
          </span>
          {searchQuery.trim() && (
            <span
              className="badge"
              style={{
                fontSize: "0.72rem",
                background: "rgba(56, 189, 248, 0.15)",
                color: "var(--egse-raw, #38bdf8)",
                border: "1px solid var(--egse-border-soft)",
              }}
            >
              Showing {filteredRows.length} of {rows.length}
            </span>
          )}
        </div>

        {/* Search & Actions Bar */}
        <div className="d-flex align-items-center gap-2 flex-grow-1 justify-content-end" style={{ maxWidth: 520 }}>
          <div className="input-group input-group-sm" style={{ maxWidth: 320 }}>
            <span className="input-group-text bg-dark border-secondary text-muted px-2">
              <Search size={14} />
            </span>
            <input
              type="text"
              className="form-control form-control-sm egse-field border-secondary"
              placeholder="Filter by name, offset, unit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "0.82rem" }}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setSearchQuery("")}
                title="Clear filter"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1 text-nowrap"
            onClick={addRow}
            title="Add new parameter to the top of the schema"
          >
            <Plus size={14} />
            <span>Add Parameter</span>
          </button>

          {onSave && (
            <button
              type="button"
              className="btn btn-sm btn-success d-inline-flex align-items-center gap-1 text-nowrap fw-semibold px-3"
              onClick={handleSaveClick}
              disabled={isSaving}
              style={{
                backgroundColor: "var(--egse-nominal, #10b981)",
                borderColor: "var(--egse-nominal, #10b981)",
                color: "#0b0f19",
              }}
              title="Save frame configuration"
            >
              <Save size={14} />
              <span>{isSaving ? "Saving..." : "Save Frame"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Validation Save Error Banner */}
      {saveError && (
        <div
          className="alert alert-danger py-2 px-3 mb-0 small border-0 rounded-0 d-flex align-items-center justify-content-between"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}
        >
          <span>⚠️ {saveError}</span>
          <button
            type="button"
            className="btn-close btn-close-white p-1"
            style={{ fontSize: "0.6rem" }}
            onClick={() => setSaveError(null)}
          />
        </div>
      )}

      {/* Table Scroll Container */}
      <div className="egse-panel-body p-0 egse-schema-scroll-container" style={{ overflowX: "auto", position: "relative" }}>
        <table className="table egse-table mb-0 align-middle" style={{ minWidth: 1420 }}>
          <thead>
            <tr>
              {/* Sticky Parameter Name Header */}
              <th
                className="ps-3 egse-sticky-col-header"
                style={{
                  minWidth: 260,
                  width: 280,
                  maxWidth: 340,
                }}
              >
                Parameter Name
              </th>

              {/* Offset & Length Columns */}
              {(isBitMode ? BIT_TEXT_COLUMNS : BYTE_TEXT_COLUMNS).map((c) => (
                <th
                  key={c.key}
                  style={{ minWidth: c.minWidth, width: c.width }}
                  className="text-center"
                >
                  {c.label}
                </th>
              ))}

              {/* Data Type, Signed, Endianness */}
              <th style={{ minWidth: 135, width: 140 }}>Data Type</th>
              <th style={{ minWidth: 105, width: 110 }}>Signed</th>
              <th style={{ minWidth: 80, width: 85 }}>Endianness</th>

              {/* Calibration */}
              {CALIBRATION_COLUMNS.map((c) => (
                <th key={c.key} style={{ minWidth: c.minWidth, width: c.width }} className="text-center">
                  {c.label}
                </th>
              ))}

              {/* Unit */}
              <th style={{ minWidth: 155, width: 160 }}>Unit</th>

              {/* Limits */}
              <th style={{ minWidth: 380, width: 420 }} className="text-center">
                Limits
              </th>

              {/* Enabled */}
              <th style={{ minWidth: 80, width: 85 }} className="text-center">Enabled</th>

              {/* Actions Header */}
              <th style={{ width: 48, minWidth: 48 }} className="pe-3 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const origIdx = row._origIdx;
              const isCustomUnit = row.unit && !ALL_STANDARD_UNITS.includes(row.unit);

              return (
                <tr key={origIdx}>
                  {/* Sticky Parameter Name Cell (Increased width, fully readable & editable) */}
                  <td
                    className="ps-3 egse-sticky-col-cell"
                    style={{
                      minWidth: 260,
                      width: 280,
                      maxWidth: 340,
                    }}
                  >
                    <div className="d-flex align-items-center gap-2 w-100">
                      <input
                        className="form-control form-control-sm egse-field egse-mono"
                        style={{
                          width: "100%",
                          minWidth: 220,
                          fontSize: "0.84rem",
                          fontWeight: 600,
                          letterSpacing: "0.01em",
                          color: "var(--egse-raw, #38bdf8)",
                          backgroundColor: "rgba(7, 13, 25, 0.75)",
                          borderColor: "var(--egse-border-soft)",
                          padding: "0.3rem 0.55rem",
                        }}
                        value={row.name ?? ""}
                        onChange={(e) => updateCell(origIdx, "name", e.target.value)}
                        placeholder="PARAMETER_NAME"
                        title={row.name || ""}
                      />
                      {row.addedInVersion && (
                        <span
                          className="badge rounded-pill flex-shrink-0"
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 6px",
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            whiteSpace: "nowrap",
                          }}
                          title={`Added in version ${row.addedInVersion}`}
                        >
                          v{row.addedInVersion}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Offset & Length Cells */}
                  {isBitMode ? (
                    <>
                      {/* Bit Offset */}
                      <td style={{ minWidth: 85, width: 90 }}>
                        <input
                          type="number"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.45)",
                            fontSize: "0.82rem",
                          }}
                          value={row.bitOffset ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateRow(origIdx, { bitOffset: "" });
                            } else {
                              const val = Number(raw);
                              const curBitLength = row.bitLength !== "" && row.bitLength !== undefined && row.bitLength !== null
                                ? Number(row.bitLength)
                                : 8;
                              const derivedByteOffset = Math.floor(val / 8);
                              const derivedLength = Math.ceil(((val % 8) + curBitLength) / 8);
                              updateRow(origIdx, {
                                bitOffset: val,
                                byteOffset: derivedByteOffset,
                                length: derivedLength,
                              });
                            }
                          }}
                        />
                      </td>

                      {/* Bit Length */}
                      <td style={{ minWidth: 85, width: 90 }}>
                        <input
                          type="number"
                          min="1"
                          max="64"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.45)",
                            fontSize: "0.82rem",
                          }}
                          value={row.bitLength ?? 8}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateRow(origIdx, { bitLength: "" });
                            } else {
                              const val = Number(raw);
                              const curBitOffset = row.bitOffset !== "" && row.bitOffset !== undefined && row.bitOffset !== null
                                ? Number(row.bitOffset)
                                : 0;
                              const derivedLength = Math.ceil(((curBitOffset % 8) + val) / 8);
                              updateRow(origIdx, {
                                bitLength: val,
                                length: derivedLength,
                              });
                            }
                          }}
                        />
                      </td>

                      {/* Derived Byte Offset */}
                      <td style={{ minWidth: 100, width: 110 }}>
                        <input
                          type="number"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.3)",
                            fontSize: "0.82rem",
                          }}
                          value={row.byteOffset ?? (row.bitOffset !== "" && row.bitOffset !== null && row.bitOffset !== undefined ? Math.floor(Number(row.bitOffset) / 8) : "")}
                          onChange={(e) => updateCell(origIdx, "byteOffset", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </td>

                      {/* Derived Length */}
                      <td style={{ minWidth: 95, width: 105 }}>
                        <input
                          type="number"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.3)",
                            fontSize: "0.82rem",
                          }}
                          value={row.length ?? (row.bitLength ? Math.ceil(((Number(row.bitOffset || 0) % 8) + Number(row.bitLength)) / 8) : 1)}
                          onChange={(e) => updateCell(origIdx, "length", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Byte Offset */}
                      <td style={{ minWidth: 90, width: 95 }}>
                        <input
                          type="number"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.45)",
                            fontSize: "0.82rem",
                          }}
                          value={row.byteOffset ?? ""}
                          onChange={(e) => updateCell(origIdx, "byteOffset", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </td>

                      {/* Bit Offset */}
                      <td style={{ minWidth: 85, width: 90 }}>
                        <input
                          type="number"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.45)",
                            fontSize: "0.82rem",
                          }}
                          value={row.bitOffset ?? ""}
                          onChange={(e) => updateCell(origIdx, "bitOffset", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </td>

                      {/* Length */}
                      <td style={{ minWidth: 80, width: 85 }}>
                        <input
                          type="number"
                          className="form-control form-control-sm egse-field egse-mono text-center border-0"
                          style={{
                            backgroundColor: "rgba(7, 13, 25, 0.45)",
                            fontSize: "0.82rem",
                          }}
                          value={row.length ?? ""}
                          onChange={(e) => updateCell(origIdx, "length", e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </td>
                    </>
                  )}

                  {/* Data Type / Signed / Endianness: shown as the decoder reads them, and changed
                      together through the same mapping as the Edit Parameter modal. */}
                  {(() => {
                    const enc = describeEncoding(row);
                    const types = DATA_TYPES.includes(enc.base) ? DATA_TYPES : [enc.base, ...DATA_TYPES];
                    const change = (field, value) => updateRow(origIdx, applyEncodingChange(row, field, value));
                    const selectStyle = { fontSize: "0.8rem", backgroundColor: "rgba(7, 13, 25, 0.45)" };
                    return (
                      <>
                        <td style={{ minWidth: 135, width: 140 }}>
                          <select className="form-select form-select-sm egse-field border-0" style={selectStyle}
                            aria-label={`Data type of ${row.name || "parameter"}`}
                            value={enc.base} onChange={(e) => change("base", e.target.value)}>
                            {types.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td style={{ minWidth: 105, width: 110 }}>
                          <select className="form-select form-select-sm egse-field border-0" style={selectStyle}
                            aria-label={`Signedness of ${row.name || "parameter"}`}
                            value={enc.signedness ?? ""} disabled={!hasSignedness(enc.base)}
                            onChange={(e) => change("signedness", e.target.value)}>
                            {!enc.signedness && <option value="">n/a</option>}
                            <option value="unsigned">unsigned</option>
                            <option value="signed">signed</option>
                          </select>
                        </td>
                        <td style={{ minWidth: 80, width: 85 }}>
                          <select className="form-select form-select-sm egse-field border-0 text-center" style={selectStyle}
                            aria-label={`Endianness of ${row.name || "parameter"}`}
                            value={enc.byteOrder ?? ""} disabled={!hasByteOrder(enc.base)}
                            onChange={(e) => change("byteOrder", e.target.value)}>
                            {!enc.byteOrder && <option value="">n/a</option>}
                            <option value="LE">LE</option>
                            <option value="BE">BE</option>
                          </select>
                        </td>
                      </>
                    );
                  })()}

                  {/* Scale & Offset */}
                  {CALIBRATION_COLUMNS.map((c) => (
                    <td key={c.key} style={{ minWidth: c.minWidth, width: c.width }}>
                      <input
                        className="form-control form-control-sm egse-field egse-mono text-center border-0"
                        style={{
                          backgroundColor: "rgba(7, 13, 25, 0.45)",
                          fontSize: "0.82rem",
                        }}
                        value={row[c.key] ?? ""}
                        onChange={(e) => updateCell(origIdx, c.key, e.target.value)}
                      />
                    </td>
                  ))}

                  {/* Dedicated Unit Column with Dropdown */}
                  <td style={{ minWidth: 155, width: 160 }}>
                    {customEditingRowIdx === origIdx ? (
                      <div className="d-flex align-items-center gap-1">
                        <input
                          type="text"
                          className="form-control form-control-sm egse-field font-monospace p-1"
                          style={{ width: "95px", fontSize: "0.78rem" }}
                          placeholder="Unit symbol"
                          value={customInputVal}
                          onChange={(e) => setCustomInputVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              updateCell(origIdx, "unit", customInputVal.trim());
                              setCustomEditingRowIdx(null);
                            } else if (e.key === "Escape") {
                              setCustomEditingRowIdx(null);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-info text-dark p-1 d-flex align-items-center justify-content-center"
                          style={{ width: "24px", height: "24px" }}
                          title="Save custom unit"
                          onClick={() => {
                            updateCell(origIdx, "unit", customInputVal.trim());
                            setCustomEditingRowIdx(null);
                          }}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary p-1 d-flex align-items-center justify-content-center"
                          style={{ width: "24px", height: "24px" }}
                          title="Cancel"
                          onClick={() => setCustomEditingRowIdx(null)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <select
                        className="form-select form-select-sm egse-field font-monospace p-1 border-0"
                        style={{
                          width: "140px",
                          fontSize: "0.78rem",
                          backgroundColor: row.unit ? "rgba(6, 182, 212, 0.08)" : "rgba(7, 13, 25, 0.45)",
                          color: row.unit ? "var(--egse-raw, #06b6d4)" : undefined,
                          fontWeight: row.unit ? "600" : "normal",
                        }}
                        value={
                          !row.unit
                            ? ""
                            : ALL_STANDARD_UNITS.includes(row.unit)
                              ? row.unit
                              : "__CUSTOM_VALUE__"
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__CUSTOM_PROMPT__") {
                            setCustomInputVal(row.unit || "");
                            setCustomEditingRowIdx(origIdx);
                          } else if (val === "__CUSTOM_VALUE__") {
                            // Keep existing custom value
                          } else {
                            updateCell(origIdx, "unit", val);
                          }
                        }}
                      >
                        <option value="">(None)</option>

                        {/* Show custom option if value not in standard list */}
                        {isCustomUnit && (
                          <option value="__CUSTOM_VALUE__">
                            {row.unit} (Custom)
                          </option>
                        )}

                        {/* Standard Categories */}
                        {Object.values(UNIT_CATEGORIES).map((cat) => (
                          <optgroup key={cat.key} label={cat.label}>
                            {cat.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.id} - {u.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}

                        <optgroup label="Custom">
                          <option value="__CUSTOM_PROMPT__">✏️ Custom Unit...</option>
                        </optgroup>
                      </select>
                    )}
                  </td>

                  {/* Limits Column: Status Ranges UI (NORMAL, CRITICAL, Optional WARNING) & Live Preview */}
                  <td style={{ minWidth: 440, width: 480 }}>
                    {(row.statusRanges || row.limits?.statusRanges) ? (
                      <div className="d-flex flex-column gap-2 py-1" data-testid={`status-ranges-editor-${origIdx}`}>
                        <div className="d-flex align-items-center justify-content-between">
                          <span className="text-muted" style={{ fontSize: "0.68rem" }}>Status Ranges</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-info py-0 px-2"
                            style={{ fontSize: "0.68rem" }}
                            onClick={() => {
                              const next = rows.map((r, i) => {
                                if (i !== origIdx) return r;
                                const updatedLimits = { ...(r.limits || {}) };
                                delete updatedLimits.statusRanges;
                                return {
                                  ...r,
                                  statusRanges: null,
                                  limits: updatedLimits,
                                };
                              });
                              onChange(next);
                            }}
                            title="Switch parameter to Legacy Thresholds"
                          >
                            ⚡ Switch to Legacy Thresholds
                          </button>
                        </div>
                        {/* NORMAL Range */}
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="badge fw-semibold"
                            style={{
                              width: 82,
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              border: "1px solid rgba(16, 185, 129, 0.3)",
                              fontSize: "0.72rem",
                              padding: "4px 6px",
                              textAlign: "center",
                            }}
                          >
                            NORMAL
                          </span>
                          <div className="d-flex align-items-center gap-1 flex-fill">
                            <input
                              id={`normalMin-${origIdx}`}
                              aria-label="NORMAL Range Min"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{ backgroundColor: "rgba(7, 13, 25, 0.45)", fontSize: "0.82rem", width: 85 }}
                              value={row.statusRanges?.normal?.min ?? row.limits?.statusRanges?.normal?.min ?? row.normalMin ?? ""}
                              onChange={(e) => updateStatusRange(origIdx, "normal", "min", e.target.value)}
                              placeholder="Min"
                            />
                            <span className="text-muted small">to</span>
                            <input
                              id={`normalMax-${origIdx}`}
                              aria-label="NORMAL Range Max"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{ backgroundColor: "rgba(7, 13, 25, 0.45)", fontSize: "0.82rem", width: 85 }}
                              value={row.statusRanges?.normal?.max ?? row.limits?.statusRanges?.normal?.max ?? row.normalMax ?? ""}
                              onChange={(e) => updateStatusRange(origIdx, "normal", "max", e.target.value)}
                              placeholder="Max"
                            />
                          </div>
                        </div>

                        {/* CRITICAL Range */}
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="badge fw-semibold"
                            style={{
                              width: 82,
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              fontSize: "0.72rem",
                              padding: "4px 6px",
                              textAlign: "center",
                            }}
                          >
                            CRITICAL
                          </span>
                          <div className="d-flex align-items-center gap-1 flex-fill">
                            <input
                              id={`criticalMin-${origIdx}`}
                              aria-label="CRITICAL Range Min"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{ backgroundColor: "rgba(7, 13, 25, 0.45)", fontSize: "0.82rem", width: 85 }}
                              value={row.statusRanges?.critical?.min ?? row.limits?.statusRanges?.critical?.min ?? row.criticalMin ?? ""}
                              onChange={(e) => updateStatusRange(origIdx, "critical", "min", e.target.value)}
                              placeholder="Min"
                            />
                            <span className="text-muted small">to</span>
                            <input
                              id={`criticalMax-${origIdx}`}
                              aria-label="CRITICAL Range Max"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{ backgroundColor: "rgba(7, 13, 25, 0.45)", fontSize: "0.82rem", width: 85 }}
                              value={row.statusRanges?.critical?.max ?? row.limits?.statusRanges?.critical?.max ?? row.criticalMax ?? ""}
                              onChange={(e) => updateStatusRange(origIdx, "critical", "max", e.target.value)}
                              placeholder="Max"
                            />
                          </div>
                        </div>

                        {/* WARNING Range (Optional) */}
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="badge fw-semibold"
                            style={{
                              width: 82,
                              backgroundColor: "rgba(245, 158, 11, 0.15)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              fontSize: "0.72rem",
                              padding: "4px 6px",
                              textAlign: "center",
                            }}
                          >
                            WARNING
                          </span>
                          <div className="d-flex align-items-center gap-1 flex-fill">
                            <input
                              id={`warningMin-${origIdx}`}
                              aria-label="WARNING Range Min"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{ backgroundColor: "rgba(7, 13, 25, 0.45)", fontSize: "0.82rem", width: 85 }}
                              value={row.statusRanges?.warning?.min ?? row.limits?.statusRanges?.warning?.min ?? row.warningMin ?? ""}
                              onChange={(e) => updateStatusRange(origIdx, "warning", "min", e.target.value)}
                              placeholder="Min (opt)"
                            />
                            <span className="text-muted small">to</span>
                            <input
                              id={`warningMax-${origIdx}`}
                              aria-label="WARNING Range Max"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{ backgroundColor: "rgba(7, 13, 25, 0.45)", fontSize: "0.82rem", width: 85 }}
                              value={row.statusRanges?.warning?.max ?? row.limits?.statusRanges?.warning?.max ?? row.warningMax ?? ""}
                              onChange={(e) => updateStatusRange(origIdx, "warning", "max", e.target.value)}
                              placeholder="Max (opt)"
                            />
                            <span className="text-muted ms-1" style={{ fontSize: "0.68rem" }}>(Optional)</span>
                          </div>
                        </div>

                        {/* Live Status Ranges Preview */}
                        <div
                          className="p-1 px-2 rounded font-monospace"
                          style={{
                            fontSize: "0.72rem",
                            backgroundColor: "rgba(15, 23, 42, 0.6)",
                            border: "1px dashed var(--egse-border-soft, rgba(255,255,255,0.1))",
                            color: "var(--egse-text-secondary, #94a3b8)",
                            lineHeight: 1.35,
                          }}
                        >
                          {getStatusRangesPreview(row).map((line, pIdx) => (
                            <div key={pIdx}>{line}</div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* Legacy Parameters UI */
                      <div className="d-flex flex-column gap-2 py-1" data-testid={`legacy-limits-editor-${origIdx}`}>
                        <div className="d-flex align-items-center justify-content-between">
                          <span className="text-muted" style={{ fontSize: "0.68rem" }}>Legacy Thresholds</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-info py-0 px-2"
                            style={{ fontSize: "0.68rem" }}
                            onClick={() => {
                              const initialSR = {
                                normal: { min: "", max: "" },
                                critical: { min: "", max: "" },
                                warning: { min: "", max: "" },
                              };
                              const next = rows.map((r, i) =>
                                i === origIdx
                                  ? {
                                      ...r,
                                      statusRanges: initialSR,
                                      limits: {
                                        ...(r.limits || {}),
                                        statusRanges: initialSR,
                                      },
                                    }
                                  : r
                              );
                              onChange(next);
                            }}
                            title="Upgrade parameter to configurable Status Ranges"
                          >
                            ⚡ Switch to Status Ranges
                          </button>
                        </div>
                        <div className="d-flex align-items-start gap-2">
                          <div className="d-flex flex-column gap-1 flex-fill">
                            <label
                              htmlFor={`alarmLow-${origIdx}`}
                              className="form-label mb-0 small fw-semibold text-danger-emphasis"
                              style={{ fontSize: "0.76rem" }}
                            >
                              Critical if below
                            </label>
                            <input
                              id={`alarmLow-${origIdx}`}
                              aria-label="Critical if below"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{
                                backgroundColor: "rgba(7, 13, 25, 0.45)",
                                fontSize: "0.82rem",
                              }}
                              value={row.alarmLow ?? ""}
                              onChange={(e) => updateCell(origIdx, "alarmLow", e.target.value)}
                              placeholder="e.g. 10"
                            />
                            <span className="text-muted" style={{ fontSize: "0.68rem", lineHeight: 1.2 }}>
                              Leave empty if not needed
                            </span>
                          </div>

                          <div className="d-flex flex-column gap-1 flex-fill">
                            <label
                              htmlFor={`alarmHigh-${origIdx}`}
                              className="form-label mb-0 small fw-semibold text-danger-emphasis"
                              style={{ fontSize: "0.76rem" }}
                            >
                              Critical if above
                            </label>
                            <input
                              id={`alarmHigh-${origIdx}`}
                              aria-label="Critical if above"
                              type="number"
                              className="form-control form-control-sm egse-field egse-mono text-center"
                              style={{
                                backgroundColor: "rgba(7, 13, 25, 0.45)",
                                fontSize: "0.82rem",
                              }}
                              value={row.alarmHigh ?? ""}
                              onChange={(e) => updateCell(origIdx, "alarmHigh", e.target.value)}
                              placeholder="e.g. 50"
                            />
                            <span className="text-muted" style={{ fontSize: "0.68rem", lineHeight: 1.2 }}>
                              Leave empty if not needed
                            </span>
                          </div>
                        </div>

                        {hasWarnValues(row) && (
                          <div className="d-flex align-items-start gap-2 pt-1 border-top border-secondary border-opacity-25">
                            <div className="d-flex flex-column gap-1 flex-fill">
                              <label
                                htmlFor={`warnLow-${origIdx}`}
                                className="form-label mb-0 small fw-semibold text-warning"
                                style={{ fontSize: "0.74rem" }}
                              >
                                Warn Low
                              </label>
                              <input
                                id={`warnLow-${origIdx}`}
                                aria-label="Warn Low"
                                type="number"
                                className="form-control form-control-sm egse-field egse-mono text-center"
                                style={{
                                  backgroundColor: "rgba(7, 13, 25, 0.45)",
                                  fontSize: "0.82rem",
                                }}
                                value={row.warnLow ?? ""}
                                onChange={(e) => updateCell(origIdx, "warnLow", e.target.value)}
                              />
                            </div>
                            <div className="d-flex flex-column gap-1 flex-fill">
                              <label
                                htmlFor={`warnHigh-${origIdx}`}
                                className="form-label mb-0 small fw-semibold text-warning"
                                style={{ fontSize: "0.74rem" }}
                              >
                                Warn High
                              </label>
                              <input
                                id={`warnHigh-${origIdx}`}
                                aria-label="Warn High"
                                type="number"
                                className="form-control form-control-sm egse-field egse-mono text-center"
                                style={{
                                  backgroundColor: "rgba(7, 13, 25, 0.45)",
                                  fontSize: "0.82rem",
                                }}
                                value={row.warnHigh ?? ""}
                                onChange={(e) => updateCell(origIdx, "warnHigh", e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        {/* Live Preview */}
                        <div
                          className="p-1 px-2 rounded font-monospace"
                          style={{
                            fontSize: "0.72rem",
                            backgroundColor: "rgba(15, 23, 42, 0.6)",
                            border: "1px dashed var(--egse-border-soft, rgba(255,255,255,0.1))",
                            color: "var(--egse-text-secondary, #94a3b8)",
                            lineHeight: 1.35,
                          }}
                        >
                          {getLimitsPreview(row.alarmLow, row.alarmHigh).map((line, pIdx) => (
                            <div key={pIdx}>{line}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Enabled toggle (disabled parameters are skipped by the decoder) */}
                  <td className="text-center" style={{ minWidth: 80, width: 85 }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      data-testid={`param-enabled-${origIdx}`}
                      title={row.enabled === false ? "Disabled: not decoded" : "Enabled"}
                      checked={row.enabled !== false}
                      onChange={(e) => updateCell(origIdx, "enabled", e.target.checked)}
                    />
                  </td>

                  {/* Delete Button */}
                  <td className="pe-3 text-center" style={{ width: 48, minWidth: 48 }}>
                    <button
                      className="btn btn-sm p-1 text-danger-emphasis rounded hover-bg-alarm"
                      style={{
                        color: "var(--egse-alarm)",
                        background: "none",
                        border: "none",
                        opacity: rows.length <= 1 ? 0.3 : 0.8,
                        cursor: rows.length <= 1 ? "not-allowed" : "pointer",
                        transition: "opacity 0.15s ease",
                      }}
                      title={rows.length <= 1 ? "Cannot delete the last parameter (minimum 1 parameter required)" : `Delete parameter "${row.name || origIdx + 1}"`}
                      disabled={rows.length <= 1}
                      onClick={() => deleteRow(origIdx)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredRows.length === 0 && rows.length > 0 && (
              <tr>
                <td colSpan={15} className="text-center py-4 text-muted small">
                  No parameters match filter &quot;<strong>{searchQuery}</strong>&quot;.
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-info ms-2 p-0 text-decoration-none"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear Filter
                  </button>
                </td>
              </tr>
            )}

            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-5 text-muted small">
                  <FileCode size={28} className="text-secondary opacity-50 mb-2 d-block mx-auto" />
                  <div className="mb-2">No parameters defined for this frame.</div>
                  <button
                    type="button"
                    className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
                    onClick={addRow}
                  >
                    <Plus size={14} /> Add First Parameter
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

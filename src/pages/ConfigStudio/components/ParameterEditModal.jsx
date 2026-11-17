import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { validateStatusRepresentationDraft } from "../../../utils/statusRepresentationHelper";
import { DATA_TYPES } from "../../../constants/telemetryConstants";
import { UNIT_CATEGORIES, ALL_STANDARD_UNITS } from "../../../utils/unitConversion";
import { readStatusRanges, getStatusRangesPreview, getLimitsPreview } from "./paramHelpers";
import { describeEncoding, applyEncodingChange, hasByteOrder, hasSignedness } from "./parameterTypeFields";

const RANGE_STYLE = {
  normal: { label: "NORMAL" },
  critical: { label: "CRITICAL" },
  warning: { label: "WARNING" },
};

const num = (v) => (v === "" ? "" : Number(v));

/**
 * Add / edit one parameter. Works on a local draft and only calls onSave(draft) on "Save".
 * `isNew` only changes the title.
 */
export default function ParameterEditModal({ row, isNew = false, onSave, onClose, onDraftChange, dataRepresentation = "BYTE" }) {
  const [draft, setDraft] = useState(() => ({ ...row }));
  const [error, setError] = useState("");
  const [isTypingCustomUnit, setIsTypingCustomUnit] = useState(
    () => Boolean(draft.unit && !ALL_STANDARD_UNITS.includes(draft.unit))
  );

  const isBitMode = String(dataRepresentation).toUpperCase() === "BIT";
  const [statusMappings, setStatusMappings] = useState(() => {
    let raw = row.statusRepresentation;
    if (typeof raw === "string") {
      const tr = raw.trim();
      if (tr.startsWith("[") || tr.startsWith("{")) {
        try { raw = JSON.parse(tr); } catch { raw = []; }
      } else {
        raw = [];
      }
    }
    if (raw && !Array.isArray(raw) && typeof raw === "object") {
      raw = [raw];
    }
    if (Array.isArray(raw)) {
      raw = raw
        .map((item) => {
          if (typeof item === "string") {
            const tr = item.trim();
            if (tr.startsWith("{")) {
              try { return JSON.parse(tr); } catch { return null; }
            }
            return null;
          }
          return item;
        })
        .filter((item) => item && typeof item === "object");
    } else {
      raw = [];
    }
    return JSON.parse(JSON.stringify(raw));
  });
  const isLegacy = !(draft.statusRanges || draft.limits?.statusRanges);
  const ranges = readStatusRanges(draft);

  useEffect(() => {
    onDraftChange?.({
      ...draft,
      statusRepresentation: statusMappings,
    });
  }, [draft, statusMappings, onDraftChange]);

  const set = (key, value) => {
    setError("");
    setDraft((d) => ({ ...d, [key]: value }));
  };

  // Shown from the stored fields; they change only when one of the three encoding selects does.
  const encoding = describeEncoding(draft);
  const typeOptions = DATA_TYPES.includes(encoding.base) ? DATA_TYPES : [encoding.base, ...DATA_TYPES];
  const changeEncoding = (field, value) => {
    setError("");
    setDraft((d) => ({ ...d, ...applyEncodingChange(d, field, value) }));
  };

  const setRange = (status, bound, value) => {
    const next = { ...ranges, [status]: { ...ranges[status], [bound]: value } };
    setDraft((d) => ({
      ...d,
      statusRanges: next,
      limits: { ...(d.limits || {}), statusRanges: next },
      [`${status}Min`]: next[status].min,
      [`${status}Max`]: next[status].max,
    }));
  };

  const switchToRanges = () => {
    const empty = { normal: { min: "", max: "" }, critical: { min: "", max: "" }, warning: { min: "", max: "" } };
    setDraft((d) => ({ ...d, statusRanges: empty, limits: { ...(d.limits || {}), statusRanges: empty } }));
  };

  const switchToLegacy = () => {
    setDraft((d) => {
      const nextLimits = { ...(d.limits || {}) };
      delete nextLimits.statusRanges;
      return {
        ...d,
        statusRanges: null,
        limits: nextLimits,
      };
    });
  };

  const handleUnitSelect = (e) => {
    const val = e.target.value;
    if (val === "__CUSTOM_PROMPT__") {
      setIsTypingCustomUnit(true);
      return;
    }
    setIsTypingCustomUnit(false);
    set("unit", val);
  };

  const addStatusMapping = () => {
    setError("");
    setStatusMappings((prev) => [...prev, { rawValue: "", status: "", description: "" }]);
  };

  const updateStatusMapping = (index, field, value) => {
    setError("");
    setStatusMappings((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const removeStatusMapping = (index) => {
    setError("");
    setStatusMappings((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = () => {
    if (!String(draft.name || "").trim()) {
      setError("Parameter name is required.");
      return;
    }
    if (isBitMode) {
      if (draft.bitOffset === "" || draft.bitOffset === null || draft.bitOffset === undefined || isNaN(Number(draft.bitOffset)) || Number(draft.bitOffset) < 0) {
        setError("Bit Offset must be a non-negative integer for BIT frames.");
        return;
      }
      if (draft.bitLength === "" || draft.bitLength === null || draft.bitLength === undefined || isNaN(Number(draft.bitLength)) || Number(draft.bitLength) < 1 || Number(draft.bitLength) > 64) {
        setError("Bit Length must be between 1 and 64 bits for BIT frames.");
        return;
      }
    }
    const srValidation = validateStatusRepresentationDraft(statusMappings);
    if (!srValidation.valid) {
      setError(srValidation.error);
      return;
    }

    const cleanDraft = {
      ...draft,
      name: String(draft.name).trim(),
      statusRepresentation: srValidation.cleanList.length > 0 ? srValidation.cleanList : [],
      ...(isBitMode ? {
        bitOffset: Number(draft.bitOffset ?? 0),
        bitLength: Number(draft.bitLength ?? 8),
        byteOffset: Math.floor(Number(draft.bitOffset ?? 0) / 8),
        length: Math.ceil(((Number(draft.bitOffset ?? 0) % 8) + Number(draft.bitLength ?? 8)) / 8),
      } : {}),
    };
    onSave(cleanDraft);
  };

  return (
    <div className="cs-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cs-modal" role="dialog" aria-modal="true" aria-label="Edit parameter">
        <header>
          <strong>{isNew ? "Add Parameter" : `Edit Parameter · ${row.name}`}</strong>
          <button type="button" className="cs-icon-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="body">
          <div className="span3">
            <label>Parameter Name</label>
            <input
              className="cs-field cs-mono"
              autoFocus
              value={draft.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="bus_voltage"
            />
          </div>

          {isBitMode ? (
            <>
              <div>
                <label>Bit Offset *</label>
                <input
                  type="number"
                  min="0"
                  className="cs-field cs-mono"
                  value={draft.bitOffset ?? ""}
                  onChange={(e) => {
                    const val = num(e.target.value);
                    set("bitOffset", val);
                    if (val !== "") {
                      set("byteOffset", Math.floor(Number(val) / 8));
                      set("length", Math.ceil(((Number(val) % 8) + Number(draft.bitLength ?? 8)) / 8));
                    }
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <label>Bit Length (1–64) *</label>
                <input
                  type="number"
                  min="1"
                  max="64"
                  className="cs-field cs-mono"
                  value={draft.bitLength ?? 8}
                  onChange={(e) => {
                    const val = num(e.target.value);
                    set("bitLength", val);
                    if (val !== "") set("length", Math.ceil(((Number(draft.bitOffset ?? 0) % 8) + Number(val)) / 8));
                  }}
                  placeholder="8"
                />
              </div>
              <div>
                <label>Derived Byte Offset</label>
                <input
                  type="number"
                  className="cs-field cs-mono"
                  value={draft.byteOffset ?? (draft.bitOffset !== "" && draft.bitOffset !== null && draft.bitOffset !== undefined ? Math.floor(Number(draft.bitOffset) / 8) : "")}
                  onChange={(e) => set("byteOffset", num(e.target.value))}
                  title="Derived: floor(bitOffset / 8)"
                />
              </div>
              <div>
                <label>Derived Byte Span</label>
                <input
                  type="number"
                  className="cs-field cs-mono"
                  value={draft.length ?? (draft.bitLength ? Math.ceil(((Number(draft.bitOffset || 0) % 8) + Number(draft.bitLength)) / 8) : 1)}
                  onChange={(e) => set("length", num(e.target.value))}
                  title="Derived byte span: ceil(((bitOffset % 8) + bitLength) / 8)"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label>Byte Offset</label>
                <input
                  type="number"
                  className="cs-field cs-mono"
                  value={draft.byteOffset ?? ""}
                  onChange={(e) => set("byteOffset", num(e.target.value))}
                />
              </div>
              <div>
                <label>Bit Offset</label>
                <input
                  type="number"
                  className="cs-field cs-mono"
                  value={draft.bitOffset ?? ""}
                  onChange={(e) => set("bitOffset", num(e.target.value))}
                />
              </div>
              <div>
                <label>Length (bytes)</label>
                <input
                  type="number"
                  className="cs-field cs-mono"
                  value={draft.length ?? ""}
                  onChange={(e) => set("length", num(e.target.value))}
                />
              </div>
            </>
          )}

          <div>
            <label>Data Type</label>
            <select
              className="cs-field"
              aria-label="Data Type"
              value={encoding.base}
              onChange={(e) => changeEncoding("base", e.target.value)}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Signed / Unsigned</label>
            <select
              className="cs-field"
              aria-label="Signed / Unsigned"
              value={encoding.signedness ?? ""}
              disabled={!hasSignedness(encoding.base)}
              onChange={(e) => changeEncoding("signedness", e.target.value)}
            >
              {!encoding.signedness && <option value="">n/a</option>}
              <option value="unsigned">unsigned</option>
              <option value="signed">signed</option>
            </select>
          </div>
          <div>
            <label>Endianness</label>
            <select
              className="cs-field"
              aria-label="Endianness"
              value={encoding.byteOrder ?? ""}
              disabled={!hasByteOrder(encoding.base)}
              onChange={(e) => changeEncoding("byteOrder", e.target.value)}
            >
              {!encoding.byteOrder && <option value="">n/a (single byte)</option>}
              <option value="BE">Big Endian (BE)</option>
              <option value="LE">Little Endian (LE)</option>
            </select>
          </div>

          <div>
            <label>Scale</label>
            <input
              className="cs-field cs-mono"
              value={draft.scale ?? ""}
              onChange={(e) => set("scale", e.target.value)}
            />
          </div>
          <div>
            <label>Offset</label>
            <input
              className="cs-field cs-mono"
              value={draft.offset ?? ""}
              onChange={(e) => set("offset", e.target.value)}
            />
          </div>

          {/* Equation (Only shown for numeric parameters) */}
          {(() => {
            const dtUpper = String(draft.dataType || "").toUpperCase();
            const isBitField = typeof draft.bitLength === "number" && draft.bitLength >= 1;
            const isNonNumeric =
              dtUpper.includes("HEX") ||
              dtUpper === "BOOL" ||
              dtUpper === "ENUM" ||
              isBitField ||
              draft.exportFormat === "hex";
            if (isNonNumeric) return null;

            return (
              <div className="span3" style={{ background: "rgba(59, 130, 246, 0.05)", padding: "8px 10px", borderRadius: "6px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontWeight: 600, color: "var(--cs-text-bright, #fff)", margin: 0 }}>
                    Engineering Equation (Formula)
                  </label>
                  <span style={{ fontSize: "0.72rem", color: "var(--cs-accent, #60a5fa)" }}>
                    Variable: <code>x</code> · Note: <strong>^ means power</strong>
                  </span>
                </div>
                <input
                  className="cs-field cs-mono"
                  value={draft.equation ?? ""}
                  onChange={(e) => set("equation", e.target.value)}
                  placeholder="e.g. x * 0.1 + 5 or x^2 + 10"
                  title="Equation evaluated on x, the value after Scale and Offset. Note: ^ represents power."
                  data-testid="parameter-equation-input"
                />
                <div style={{ fontSize: "0.68rem", color: "var(--cs-text-muted, #94a3b8)", marginTop: "4px" }}>
                  Applied after Scale and Offset: <code>x = raw × scale + offset</code>. The result is the final engineering value. Supports <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>, <code>^</code> (power), <code>sqrt(x)</code>, <code>abs(x)</code>, etc.
                </div>
              </div>
            );
          })()}

          {/* Categorized Unit Dropdown with Custom typing */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Unit</label>
              {isTypingCustomUnit && (
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--cs-accent, #3b82f6)",
                    fontSize: ".7rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  onClick={() => setIsTypingCustomUnit(false)}
                >
                  List view
                </button>
              )}
            </div>
            {isTypingCustomUnit ? (
              <input
                className="cs-field cs-mono"
                autoFocus
                placeholder="e.g. mV, rpm, custom"
                value={draft.unit ?? ""}
                onChange={(e) => set("unit", e.target.value)}
              />
            ) : (
              <select
                className="cs-field cs-mono"
                value={draft.unit ?? ""}
                onChange={handleUnitSelect}
                aria-label="Unit"
              >
                <option value="">(None)</option>
                {draft.unit && !ALL_STANDARD_UNITS.includes(draft.unit) && (
                  <option value={draft.unit}>{draft.unit} (Custom)</option>
                )}
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
          </div>

          <div>
            <label>Valid Min</label>
            <input
              className="cs-field cs-mono"
              value={draft.minValue ?? ""}
              onChange={(e) => set("minValue", e.target.value)}
            />
          </div>
          <div>
            <label>Valid Max</label>
            <input
              className="cs-field cs-mono"
              value={draft.maxValue ?? ""}
              onChange={(e) => set("maxValue", e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <label
              style={{
                display: "flex",
                gap: ".5rem",
                alignItems: "center",
                margin: 0,
                fontSize: ".85rem",
                color: "inherit",
              }}
            >
              <input
                type="checkbox"
                checked={draft.enabled !== false}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              Enabled (decoded)
            </label>
          </div>

          {/* Status Limits Section with Bidirectional Switch */}
          <div className="span3">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ margin: 0 }}>Status Limits</label>
              <button
                type="button"
                className="cs-btn sm outline-blue"
                style={{ fontSize: ".72rem", padding: ".2rem .5rem" }}
                onClick={isLegacy ? switchToRanges : switchToLegacy}
              >
                {isLegacy ? "⚡ Switch to Status Ranges" : "⚡ Switch to Legacy Thresholds"}
              </button>
            </div>

            {isLegacy ? (
              <div style={{ marginTop: ".5rem" }}>
                <div className="cs-split">
                  <div style={{ flex: 1 }}>
                    <label>Critical if below</label>
                    <input
                      type="number"
                      className="cs-field cs-mono"
                      value={draft.alarmLow ?? ""}
                      onChange={(e) => set("alarmLow", e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Critical if above</label>
                    <input
                      type="number"
                      className="cs-field cs-mono"
                      value={draft.alarmHigh ?? ""}
                      onChange={(e) => set("alarmHigh", e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Warn low</label>
                    <input
                      type="number"
                      className="cs-field cs-mono"
                      value={draft.warnLow ?? ""}
                      onChange={(e) => set("warnLow", e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Warn high</label>
                    <input
                      type="number"
                      className="cs-field cs-mono"
                      value={draft.warnHigh ?? ""}
                      onChange={(e) => set("warnHigh", e.target.value)}
                    />
                  </div>
                </div>
                <div className="cs-preview">
                  {getLimitsPreview(draft.alarmLow, draft.alarmHigh).map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: ".5rem" }}>
                {["normal", "critical", "warning"].map((k) => (
                  <div className="cs-range-row" key={k}>
                    <span className={`tag cs-range-tag-${k}`}>
                      {RANGE_STYLE[k].label}
                    </span>
                    <input
                      type="number"
                      aria-label={`${RANGE_STYLE[k].label} Range Min`}
                      className="cs-field cs-mono"
                      placeholder={k === "warning" ? "Min (opt)" : "Min"}
                      value={ranges[k].min}
                      onChange={(e) => setRange(k, "min", e.target.value)}
                    />
                    <input
                      type="number"
                      aria-label={`${RANGE_STYLE[k].label} Range Max`}
                      className="cs-field cs-mono"
                      placeholder={k === "warning" ? "Max (opt)" : "Max"}
                      value={ranges[k].max}
                      onChange={(e) => setRange(k, "max", e.target.value)}
                    />
                  </div>
                ))}
                <div className="cs-preview">
                  {getStatusRangesPreview(draft).map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Status Representation (DECIMAL ONLY) Section */}
          <div className="span3" style={{ borderTop: "1px solid var(--cs-border, rgba(255,255,255,0.08))", paddingTop: "0.8rem", marginTop: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <div>
                <label style={{ margin: 0, fontWeight: 600 }}>Status Representation (Discrete Mapping)</label>
                <div style={{ fontSize: "0.74rem", color: "var(--cs-muted, #94a3b8)", marginTop: "2px" }}>
                  Map engineering values (post-scaling/equation) to status labels (<span style={{ color: "#38bdf8", fontWeight: 600 }}>DECIMAL ONLY</span>, e.g. 20 → PPM, 20.5 → WARNING). Hex and binary are not supported.
                </div>
              </div>
              <button
                type="button"
                className="cs-btn sm outline-blue"
                style={{ fontSize: ".72rem", padding: ".25rem .6rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                onClick={addStatusMapping}
              >
                <Plus size={13} /> Add Mapping
              </button>
            </div>

            {statusMappings.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "110px 140px 1fr 32px", gap: "0.4rem", fontSize: "0.72rem", color: "var(--cs-muted)", paddingLeft: "2px" }}>
                  <span>Engineering Value *</span>
                  <span>Status Label *</span>
                  <span>Description (Optional)</span>
                  <span></span>
                </div>
                {statusMappings.map((mapping, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "110px 140px 1fr 32px", gap: "0.4rem", alignItems: "center" }}>
                    <input
                      type="text"
                      className="cs-field cs-mono"
                      placeholder="20"
                      value={mapping.rawValue ?? ""}
                      onChange={(e) => updateStatusMapping(idx, "rawValue", e.target.value)}
                      title="Decimal engineering value only (e.g. 0, 20, 20.5, -1.25)"
                    />
                    <input
                      type="text"
                      className="cs-field"
                      placeholder="e.g. DM"
                      value={mapping.status ?? ""}
                      onChange={(e) => updateStatusMapping(idx, "status", e.target.value)}
                      title="Status label (e.g. DM, SPM, PPM)"
                    />
                    <input
                      type="text"
                      className="cs-field"
                      placeholder="e.g. Direct Mode"
                      value={mapping.description ?? ""}
                      onChange={(e) => updateStatusMapping(idx, "description", e.target.value)}
                      title="Optional description of this discrete state"
                    />
                    <button
                      type="button"
                      className="cs-icon-btn del"
                      onClick={() => removeStatusMapping(idx)}
                      title="Remove this status mapping"
                      style={{ padding: "0.3rem" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", fontStyle: "italic", padding: "0.3rem 0" }}>
                No discrete status representation configured. Decoded values will display their normal engineering values.
              </div>
            )}
          </div>
          {error && <div className="span3 cs-notice alarm">{error}</div>}
        </div>

        <footer>
          <button type="button" className="cs-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cs-btn primary" onClick={submit}>
            {isNew ? "Add Parameter" : "Apply Changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

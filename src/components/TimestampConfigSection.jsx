import React from "react";
import { Clock, Info } from "lucide-react";

/**
 * TimestampConfigSection
 * Dedicated component for configuring binary frame timestamp extraction.
 * 
 * Maps directly to backend frame schema:
 * {
 *   offset: Number,      // Byte offset within raw frame (e.g. 6)
 *   length: Number,      // Length in bytes: 4 (uint32) or 8 (uint64)
 *   endianness: String,  // 'LE' | 'BE'
 *   unit: String,        // 's' (seconds) | 'ms' (milliseconds)
 *   epoch: String        // 'unix'
 * }
 */
export default function TimestampConfigSection({
  timestamp = null,
  onChange,
  disabled = false,
  totalFrameLength = 0,
}) {
  const isEnabled = Boolean(timestamp && timestamp.enabled !== false && timestamp.offset !== null && timestamp.offset !== undefined);

  const offset = timestamp?.offset !== undefined && timestamp?.offset !== null ? timestamp.offset : 6;
  const length = timestamp?.length !== undefined && timestamp?.length !== null ? Number(timestamp.length) : 4;
  const endianness = timestamp?.endianness || "LE";
  const unit = timestamp?.unit || "s";
  const epoch = timestamp?.epoch || "unix";

  const handleToggle = (checked) => {
    if (!checked) {
      onChange(null);
    } else {
      onChange({
        enabled: true,
        offset: 6,
        length: 4,
        endianness: "LE",
        unit: "s",
        epoch: "unix",
      });
    }
  };

  const handleFieldChange = (field, value) => {
    const updated = {
      enabled: true,
      offset: Number(offset),
      length: Number(length),
      endianness,
      unit,
      epoch,
      [field]: field === "offset" || field === "length" ? Number(value) : value,
    };
    onChange(updated);
  };

  const isOverBoundary = totalFrameLength > 0 && (Number(offset) + Number(length) > totalFrameLength);

  return (
    <div
      className="cs-timestamp-section"
      style={{
        background: "var(--cs-bg-2, #0e2140)",
        border: "1px solid var(--cs-border, rgba(120,160,220,0.18))",
        borderRadius: "8px",
        padding: "1rem",
        marginTop: "0.85rem",
        marginBottom: "0.85rem",
      }}
    >
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <Clock size={18} style={{ color: "var(--cs-accent, #1e7bff)" }} />
          <div>
            <span style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--cs-text, #e6edf7)" }}>
              Frame Timestamp Extraction
            </span>
            <small className="d-block text-muted" style={{ fontSize: "0.76rem" }}>
              Extract capture timestamp directly from raw frame payload bytes to guarantee consistent deduplication and chronological ordering.
            </small>
          </div>
        </div>

        <label className="d-flex align-items-center gap-2 mb-0" style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
          <input
            type="checkbox"
            id="timestamp-enable-toggle"
            checked={isEnabled}
            disabled={disabled}
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ width: "16px", height: "16px", cursor: disabled ? "not-allowed" : "pointer" }}
          />
          <span style={{ fontSize: "0.85rem", fontWeight: 500, color: isEnabled ? "var(--cs-accent, #5ea2ff)" : "var(--cs-muted, #8ea3c2)" }}>
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        </label>
      </div>

      {isEnabled && (
        <div style={{ marginTop: "0.9rem" }}>
          <div className="row g-2">
            <div className="col-12 col-sm-6 col-md-3">
              <label className="cs-sub d-block mb-1" htmlFor="timestamp-offset-input">
                Byte Offset
              </label>
              <input
                id="timestamp-offset-input"
                type="number"
                min="0"
                className="cs-field cs-mono w-100"
                value={offset}
                disabled={disabled}
                onChange={(e) => handleFieldChange("offset", e.target.value)}
                placeholder="e.g. 6"
              />
            </div>

            <div className="col-12 col-sm-6 col-md-3">
              <label className="cs-sub d-block mb-1" htmlFor="timestamp-length-select">
                Length (bytes)
              </label>
              <select
                id="timestamp-length-select"
                className="cs-field cs-mono w-100"
                value={length}
                disabled={disabled}
                onChange={(e) => handleFieldChange("length", e.target.value)}
              >
                <option value={4}>4 Bytes (32-bit uint)</option>
                <option value={8}>8 Bytes (64-bit uint)</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-md-3">
              <label className="cs-sub d-block mb-1" htmlFor="timestamp-endianness-select">
                Byte Order
              </label>
              <select
                id="timestamp-endianness-select"
                className="cs-field w-100"
                value={endianness}
                disabled={disabled}
                onChange={(e) => handleFieldChange("endianness", e.target.value)}
              >
                <option value="LE">Little-Endian (LE)</option>
                <option value="BE">Big-Endian (BE)</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-md-3">
              <label className="cs-sub d-block mb-1" htmlFor="timestamp-unit-select">
                Time Unit
              </label>
              <select
                id="timestamp-unit-select"
                className="cs-field w-100"
                value={unit}
                disabled={disabled}
                onChange={(e) => handleFieldChange("unit", e.target.value)}
              >
                <option value="s">Seconds (Epoch seconds)</option>
                <option value="ms">Milliseconds (Epoch ms)</option>
              </select>
            </div>
          </div>

          {isOverBoundary && (
            <div
              className="mt-2 text-warning small d-flex align-items-center gap-1"
              style={{ fontSize: "0.78rem" }}
            >
              <Info size={14} />
              <span>
                Warning: Offset ({offset}) + Length ({length}) exceeds frame length ({totalFrameLength} bytes).
              </span>
            </div>
          )}

          <div
            className="mt-2 text-muted small d-flex align-items-center gap-1"
            style={{ fontSize: "0.76rem" }}
          >
            <Info size={14} style={{ color: "var(--cs-muted)" }} />
            <span>
              Decodes {length === 4 ? "uint32" : "uint64"} {endianness} at offset {offset} as UNIX {unit === "s" ? "seconds" : "milliseconds"}.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

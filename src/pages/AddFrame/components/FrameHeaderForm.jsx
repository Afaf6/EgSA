import CrcConfigSection from "../../../components/CrcConfigSection";
import TimestampConfigSection from "../../../components/TimestampConfigSection";

const FIELDS = [
  { key: "frameName", label: "Frame Name *", placeholder: "TLM_FRAME_1", col: "col-md-4", mono: false },
  { key: "protocol", label: "Protocol", placeholder: "Generic", col: "col-md-4", mono: false, list: "protocol-options" },
  { key: "payloadBaseOffset", label: "Payload Base Offset (bytes) *", placeholder: "e.g. 16", col: "col-md-4", type: "number" },
  { key: "frameLength", label: "Total Frame Length (bytes)", placeholder: "e.g. 64", col: "col-md-4", type: "number" },
  { key: "headerLength", label: "Header Length (bytes)", placeholder: "e.g. 9", col: "col-md-4", type: "number" },
  { key: "headerOffset", label: "Header Offset (bytes, default 0)", placeholder: "0", col: "col-md-4", type: "number" },
  { key: "delimiterOffset", label: "Delimiter Search From (byte)", placeholder: "e.g. 32", col: "col-md-4", type: "number" },
  { key: "headerPattern", label: "Header Pattern (hex bytes) *", placeholder: "e.g. 1A 2B 3C 4D", col: "col-md-4" },
  { key: "delimiterPattern", label: "Payload Delimiter (hex, e.g. C0)", placeholder: "e.g. C0", col: "col-md-4" },
];

export default function FrameHeaderForm({
  values,
  onChange,
  availableProtocols = ["Generic"],
}) {
  const currentProto = (values?.protocol || "").trim();
  const isRegistered =
    !currentProto ||
    availableProtocols.some(
      (p) => String(p || "").trim().toLowerCase() === currentProto.toLowerCase()
    );

  const hasPayloadDelimiter = Boolean((values?.delimiterPattern || "").trim());
  const delimOffsetRaw = values?.delimiterOffset;
  const showDelimSearchHint =
    hasPayloadDelimiter &&
    (delimOffsetRaw === "" ||
      delimOffsetRaw === null ||
      delimOffsetRaw === undefined ||
      Number(delimOffsetRaw) === 0);

  return (
    <div className="egse-panel">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">
          1 · Frame & Header
        </h3>
      </div>

      <div className="egse-panel-body">
        <div className="row g-3">
          {FIELDS.map((f) => (
            <div
              className={f.col}
              key={f.key}
            >
              <label
                className="form-label small"
                style={{
                  color:
                    "var(--egse-text-secondary)",
                }}
              >
                {f.label}
              </label>

              <input
                type={f.type || "text"}
                list={f.list}
                className={`form-control egse-field ${f.key === "frameName" || f.key === "protocol" ? "" : "egse-mono"}`}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            </div>
          ))}

          <div className="col-md-4">
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Data Representation
            </label>
            <select
              className="form-select egse-field"
              value={values.dataRepresentation || "BYTE"}
              onChange={(e) => onChange("dataRepresentation", e.target.value)}
            >
              <option value="BYTE">BYTE (Byte-addressed)</option>
              <option value="BIT">BIT (Bit-addressed)</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Bit Numbering
            </label>
            <select
              className="form-select egse-field"
              value={values.bitNumbering || "LSB-0"}
              disabled={values.dataRepresentation !== "BIT"}
              onChange={(e) => onChange("bitNumbering", e.target.value)}
            >
              <option value="LSB-0">LSB-0 (Little-Endian Bitstream)</option>
              <option value="MSB-0">MSB-0 (Big-Endian Bitstream / CCSDS)</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
              Trailer Length (bytes)
            </label>
            <input
              type="number"
              min="0"
              className="form-control egse-field egse-mono"
              placeholder="0"
              value={values.trailerLength ?? 0}
              onChange={(e) => onChange("trailerLength", e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>

          {!isRegistered && (
            <div className="col-12 mt-2">
              <div
                className="alert alert-warning py-2 px-3 small d-flex align-items-center mb-0"
                role="alert"
                style={{ borderRadius: "6px" }}
              >
                <span className="me-2" style={{ fontSize: "1.1rem" }}>⚠️</span>
                <div>
                  <strong>Unknown protocol "{currentProto}".</strong> This is supported — the frame layout will be built automatically from the fields below, as long as a valid recognition header (Header Pattern) is provided. Leave the protocol as "Generic" if you do not need a named protocol.
                </div>
              </div>
            </div>
          )}

          {showDelimSearchHint && (
            <div className="col-12 mt-1">
              <div
                className="text-warning small d-flex align-items-center"
                style={{ fontSize: "0.825rem" }}
              >
                <span className="me-1">💡</span>
                <span>
                  Delimiter Search From should be after the frame header (e.g. &gt;= header end) so the leading frame delimiter is not matched as the payload delimiter.
                </span>
              </div>
            </div>
          )}

          <datalist id="protocol-options">
            {availableProtocols.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <TimestampConfigSection
          timestamp={values?.timestamp}
          totalFrameLength={Number(values?.frameLength || 0)}
          onChange={(newTimestamp) => {
            onChange("timestamp", newTimestamp);
          }}
        />

        <CrcConfigSection
          crc={values?.crc}
          hasCrc={values?.hasCrc !== false}
          totalFrameLength={Number(values?.frameLength || 0)}
          onChange={(newCrc, newHasCrc) => {
            onChange({ crc: newCrc, hasCrc: newHasCrc });
          }}
        />

      </div>
    </div>
  );
}

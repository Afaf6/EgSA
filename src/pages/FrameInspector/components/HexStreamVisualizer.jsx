import { useState, useMemo } from "react";
import { formatByte } from "../../../utils/formatters";
import { Copy, Check, Info, LayoutGrid, Rows } from "lucide-react";

export default function HexStreamVisualizer({ frame, decodedResult = null }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [copiedType, setCopiedType] = useState(null);
  const [viewMode, setViewMode] = useState("stream"); // 'stream' | 'clusters'

  // Normalize bytes array and sections (memoized and safe for frame === null)
  const { allBytes, sections } = useMemo(() => {
    if (!frame) {
      return { allBytes: [], sections: null };
    }

    let bytes = [];
    let sec = frame.sections || null;

    if (Array.isArray(frame.bytes) && frame.bytes.length > 0) {
      bytes = frame.bytes;
    } else {
      // Fallback: reconstruct from header, routing, delimiter, payload, crc
      const header = Array.isArray(frame.header) ? frame.header : [];
      const routing = Array.isArray(frame.routing) ? frame.routing : [];
      const delimiter = Array.isArray(frame.delimiter) ? frame.delimiter : [];
      const payload = Array.isArray(frame.payload) ? frame.payload : [];
      const crc = Array.isArray(frame.crc) ? frame.crc : [];

      bytes = [...header, ...routing, ...delimiter, ...payload, ...crc];

      let offset = 0;
      sec = [];
      if (header.length > 0) {
        sec.push({
          key: "header",
          label: "Header (Sync Pattern)",
          start: offset,
          end: offset + header.length,
          className: "egse-hex-header",
          badgeColor: "#c084fc",
        });
        offset += header.length;
      }
      if (routing.length > 0) {
        sec.push({
          key: "routing",
          label: "Subsystem / Routing",
          start: offset,
          end: offset + routing.length,
          className: "egse-hex-routing",
          badgeColor: "#60a5fa",
        });
        offset += routing.length;
      }
      if (delimiter.length > 0) {
        sec.push({
          key: "delimiter",
          label: "Delimiter Pattern",
          start: offset,
          end: offset + delimiter.length,
          className: "egse-hex-delimiter",
          badgeColor: "#2dd4bf",
        });
        offset += delimiter.length;
      }
      if (payload.length > 0) {
        sec.push({
          key: "payload",
          label: "Payload Body (Telemetry)",
          start: offset,
          end: offset + payload.length,
          className: "egse-hex-payload",
          badgeColor: "#fbbf24",
        });
        offset += payload.length;
      }
      if (crc.length > 0) {
        const isNeutral = frame.crcStatus === "SKIPPED" || frame.crcStatus === "NOT_CONFIGURED";
        const isWarn = frame.crcStatus === "CONFIG_ERROR";
        sec.push({
          key: "crc",
          label: isNeutral ? "Trailer (No CRC)" : isWarn ? "CRC (Config Error)" : `${frame.crcAlgo || "CRC"} Checksum`,
          start: offset,
          end: offset + crc.length,
          className: isNeutral ? "egse-hex-crc-neutral" : isWarn ? "egse-hex-crc-warning" : frame.crcOk ? "egse-hex-crc-ok" : "egse-hex-crc-bad",
          badgeColor: isNeutral ? "#94a3b8" : isWarn ? "#fbbf24" : frame.crcOk ? "#34d399" : "#f87171",
        });
      }
    }

    return { allBytes: bytes, sections: sec };
  }, [frame]);

  // Resolve section for a given byte index
  const getSectionForIndex = (index) => {
    if (!sections || sections.length === 0) return null;
    return sections.find((s) => index >= s.start && index < s.end);
  };

  const activeIndex = hoveredIndex !== null && hoveredIndex < allBytes.length ? hoveredIndex : 0;
  const activeByte = allBytes[activeIndex] ?? 0;
  const activeSection = getSectionForIndex(activeIndex);

  // Find if hovered byte belongs to a specific telemetry parameter
  const activeParameter = useMemo(() => {
    if (!decodedResult?.readings || !Array.isArray(decodedResult.readings)) return null;
    return (
      decodedResult.readings.find((r) => {
        const byteOffset = Number(r.byteOffset ?? r.offset ?? -1);
        const byteLen = Number(r.byteLength ?? 1);
        return byteOffset >= 0 && activeIndex >= byteOffset && activeIndex < byteOffset + byteLen;
      }) || null
    );
  }, [decodedResult, activeIndex]);

  const handleCopy = (type) => {
    let text = "";
    if (type === "spaced") {
      text = allBytes.map((b) => formatByte(b)).join(" ");
    } else {
      text = allBytes.map((b) => formatByte(b)).join("");
    }
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Group bytes by section for the Grouped view
  const groupedSections = useMemo(() => {
    if (!sections || sections.length === 0) {
      return [{ key: "all", label: "Stream Bytes", start: 0, end: allBytes.length, bytes: allBytes }];
    }
    return sections
      .map((s) => {
        const slice = allBytes.slice(s.start, Math.min(s.end, allBytes.length));
        return {
          ...s,
          byteCount: slice.length,
          bytesWithIndex: slice.map((val, idx) => ({
            val,
            globalIdx: s.start + idx,
          })),
        };
      })
      .filter((s) => s.byteCount > 0);
  }, [sections, allBytes]);

  if (!frame || allBytes.length === 0) return null;

  return (
    <div className="d-flex flex-column gap-3">
      {/* Visualizer Header Controls & Legend Bar */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 px-3 rounded" style={{ backgroundColor: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--egse-border-soft)" }}>
        {/* Sections Legend */}
        <div className="d-flex flex-wrap gap-2 small align-items-center">
          <span className="text-muted fw-semibold me-1" style={{ fontSize: "0.76rem" }}>
            LAYOUT REGIONS:
          </span>
          {sections &&
            sections.map((s) => {
              const byteCount = Math.max(0, s.end - s.start);
              if (byteCount === 0) return null;
              return (
                <span
                  key={s.key}
                  className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded"
                  style={{
                    backgroundColor: `${s.badgeColor || "#06b6d4"}18`,
                    border: `1px solid ${s.badgeColor || "#06b6d4"}50`,
                    color: s.badgeColor || "var(--egse-text-primary)",
                    fontSize: "0.74rem",
                  }}
                  title={`Bytes ${s.start} to ${s.end - 1} (${byteCount} bytes)`}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: s.badgeColor || "var(--egse-accent)",
                    }}
                  />
                  <strong className="fw-semibold">{s.label}</strong>
                  <span className="opacity-75 font-monospace">
                    [{s.start}..{s.end - 1}] ({byteCount}B)
                  </span>
                </span>
              );
            })}
        </div>

        {/* View Mode Toggle & Copy Actions */}
        <div className="d-flex align-items-center gap-2">
          {/* View Mode Toggle */}
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "stream" ? "btn-egse-primary" : "btn-egse-outline"} py-0 px-2`}
              style={{ fontSize: "0.75rem" }}
              onClick={() => setViewMode("stream")}
              title="Show continuous byte stream in a single unified part"
            >
              <LayoutGrid size={12} className="me-1" />
              <span>Continuous</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "clusters" ? "btn-egse-primary" : "btn-egse-outline"} py-0 px-2`}
              style={{ fontSize: "0.75rem" }}
              onClick={() => setViewMode("clusters")}
              title="Show inline section groups side by side"
            >
              <Rows size={12} className="me-1" />
              <span>By Section</span>
            </button>
          </div>

          <div className="d-flex gap-1 ms-1">
            <button
              type="button"
              className="btn btn-sm btn-egse-outline py-0 px-2"
              style={{ fontSize: "0.75rem" }}
              onClick={() => handleCopy("spaced")}
              title="Copy as space-separated hex bytes (e.g. 12 A0 32 C6...)"
            >
              {copiedType === "spaced" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              <span className="ms-1">Spaced</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-egse-outline py-0 px-2"
              style={{ fontSize: "0.75rem" }}
              onClick={() => handleCopy("clean")}
              title="Copy as continuous clean hex string (e.g. 12A032C6...)"
            >
              {copiedType === "clean" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              <span className="ms-1">Continuous</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Byte Tiles View: All in one single part next to each other */}
      {viewMode === "clusters" ? (
        /* ─── INLINE SECTION CLUSTERS (مجموعات متجاورة جنباً إلى جنب في نفس الجزء) ─── */
        <div
          className="egse-hex-stream"
          style={{
            maxHeight: 360,
            overflowY: "auto",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "flex-start",
          }}
        >
          {groupedSections.map((sec) => (
            <div key={sec.key} className="egse-hex-cluster">
              {/* Cluster Header */}
              <div className="egse-hex-cluster-label" style={{ color: sec.badgeColor || "var(--egse-text-primary)" }}>
                <span
                  className="egse-hex-cluster-dot"
                  style={{
                    backgroundColor: sec.badgeColor || "#06b6d4",
                    boxShadow: `0 0 6px ${sec.badgeColor || "#06b6d4"}`,
                  }}
                />
                <span>{sec.label}</span>
                <span className="opacity-75 font-monospace">({sec.byteCount}B)</span>
              </div>

              {/* Bytes Row for this cluster */}
              <div className="egse-hex-cluster-bytes">
                {sec.bytesWithIndex.map(({ val, globalIdx }) => {
                  const isHovered = hoveredIndex === globalIdx;
                  let className = `egse-hex-tile ${sec.className || "egse-hex-payload"}`;
                  if (isHovered) className += " active";

                  return (
                    <div
                      key={globalIdx}
                      className={className}
                      onMouseEnter={() => setHoveredIndex(globalIdx)}
                      onClick={() => setHoveredIndex(globalIdx)}
                      title={`Byte #${globalIdx} (0x${globalIdx.toString(16).toUpperCase().padStart(2, "0")}): 0x${formatByte(val)} · ${sec.label}`}
                    >
                      <span className="egse-hex-tile-offset">#{globalIdx}</span>
                      <span className="egse-hex-tile-val">{formatByte(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── CONTINUOUS STREAM (شريط متصل جنباً إلى جنب مع فواصل رقيقة بين الأقسام) ─── */
        <div
          className="egse-hex-stream"
          style={{
            maxHeight: 360,
            overflowY: "auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {allBytes.map((b, i) => {
            const sec = getSectionForIndex(i);
            const prevSec = i > 0 ? getSectionForIndex(i - 1) : null;
            const isNewSection = i > 0 && sec?.key !== prevSec?.key;
            const isHovered = hoveredIndex === i;
            let className = "egse-hex-tile";
            if (sec?.className) className += ` ${sec.className}`;
            if (isHovered) className += " active";

            return (
              <div key={i} className="d-inline-flex align-items-center">
                {isNewSection && (
                  <div
                    className="egse-hex-divider"
                    title={`Boundary: ${prevSec?.label || "Previous"} ➔ ${sec?.label || "Next"}`}
                  />
                )}
                <div
                  className={className}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onClick={() => setHoveredIndex(i)}
                  title={`Byte #${i} (0x${i.toString(16).toUpperCase().padStart(2, "0")}): 0x${formatByte(b)} · ${sec?.label || "Data"}`}
                >
                  <span className="egse-hex-tile-offset">#{i}</span>
                  <span className="egse-hex-tile-val">{formatByte(b)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Byte Inspector Ribbon */}
      <div
        className="py-2 px-3 rounded d-flex flex-wrap align-items-center justify-content-between gap-3 small egse-mono"
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.7)",
          border: "1px solid var(--egse-border-soft)",
          color: "var(--egse-text-secondary)",
          fontSize: "0.82rem",
        }}
      >
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <span className="text-info fw-semibold d-flex align-items-center gap-1">
            <Info size={14} /> Selected Byte:
          </span>
          <span className="fw-bold" style={{ color: "var(--egse-text-primary)" }}>
            #{activeIndex} (0x{activeIndex.toString(16).toUpperCase().padStart(2, "0")})
          </span>
          <span className="text-muted">|</span>
          <span>
            Hex: <strong className="text-warning">0x{formatByte(activeByte)}</strong>
          </span>
          <span className="text-muted">|</span>
          <span>
            Dec: <strong className="text-success">{activeByte}</strong>
          </span>
          <span className="text-muted">|</span>
          <span>
            Bin: <code className="text-info">{activeByte.toString(2).padStart(8, "0")}</code>
          </span>
          <span className="text-muted">|</span>
          <span>
            ASCII:{" "}
            <code className="text-light">
              {activeByte >= 32 && activeByte <= 126 ? String.fromCharCode(activeByte) : "·"}
            </code>
          </span>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {activeParameter && (
            <span
              className="badge px-2 py-1"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.4)",
              }}
            >
              Parameter: {activeParameter.parameterName || activeParameter.name}
            </span>
          )}

          <span
            className="badge px-2 py-1"
            style={{
              backgroundColor: activeSection?.badgeColor
                ? `${activeSection.badgeColor}25`
                : "rgba(255, 255, 255, 0.1)",
              color: activeSection?.badgeColor || "var(--egse-text-primary)",
              border: `1px solid ${activeSection?.badgeColor || "var(--egse-border-soft)"}`,
            }}
          >
            {activeSection?.label || "Payload / Data"}
          </span>
        </div>
      </div>
    </div>
  );
}

import { formatTicks, formatDateTime } from "../../../utils/formatters";
import StatusChip from "../../../components/common/StatusChip";
import { formatTimeAgo, isTelemetryStale } from "../../../utils/timeAgo";

export default function FrameSummary({ packet, frame, subsystem }) {
  if (!packet) {
    return (
      <div className="egse-panel">
        <div className="egse-panel-header">
          <h3 className="egse-panel-title">📡 Frame Summary &amp; Health</h3>
        </div>
        <div className="egse-panel-body small" style={{ color: "var(--egse-text-muted)" }}>
          Waiting for telemetry stream packet for subsystem <strong>{subsystem || "Selected Subsystem"}</strong>…
        </div>
      </div>
    );
  }

  const packetId = packet.packetId || packet._id || (packet.id ? String(packet.id).slice(-6) : "LIVE");
  const rawTimestamp = packet.frameTimestamp || packet.timestamp || packet.receivedAt || packet.logTimestamp;
  const epoch = packet.rawEpoch ?? packet.epochTicks ?? "—";
  const isCrcValid = packet.crcStatus ? (packet.crcStatus === "OK" || packet.crcStatus === "SKIPPED") : packet.crcValid === true;
  const crcDisplay = packet.crcByte !== undefined
    ? `0x${Number(packet.crcByte).toString(16).toUpperCase().padStart(2, "0")}`
    : packet.crcStatus || (isCrcValid ? "OK (PASS)" : "FAIL");

  const isStale = rawTimestamp ? isTelemetryStale(rawTimestamp) : false;
  const timeAgoText = rawTimestamp ? formatTimeAgo(rawTimestamp) : "No timestamp";
  const freshnessLabel = isStale ? `STALE (${timeAgoText})` : `FRESH (${timeAgoText})`;

  const payloadSize = packet.readings
    ? `${packet.readings.length} Decoded Parameters`
    : packet.payloadSize
    ? `${packet.payloadSize} Bytes`
    : frame?.frameBytes
    ? `${frame.frameBytes} Bytes`
    : "—";

  const rows = [
    ["Packet ID", `#${packetId}`],
    ["Subsystem / Frame", `${packet.subsystemName || subsystem || "None"} / ${frame?.name || "Standard"}`],
    ["On-Board Timestamp", formatDateTime(rawTimestamp)],
    ["Data Freshness", `${isStale ? "⚠️ STALE" : "🟢 FRESH"} (${timeAgoText})`],
    ["Epoch Ticks", typeof epoch === "number" ? formatTicks(epoch) : String(epoch)],
    ["Payload Size", payloadSize],
    ["Source", packet.sourceFile || "Live Stream"],
  ];

  return (
    <div className="egse-panel">
      <div className="egse-panel-header d-flex align-items-center justify-content-between">
        <h3 className="egse-panel-title mb-0">📡 Frame Summary &amp; Health</h3>
        <div className="d-flex align-items-center gap-2">
          <StatusChip level={isStale ? "warning" : "nominal"} label={freshnessLabel} />
          <StatusChip level={isCrcValid ? "nominal" : "alarm"} label={isCrcValid ? "CRC VALID" : "CRC FAIL"} />
        </div>
      </div>
      <div className="egse-panel-body d-flex flex-column gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="d-flex justify-content-between small">
            <span style={{ color: "var(--egse-text-secondary)" }}>{label}</span>
            <span className="egse-mono">{value}</span>
          </div>
        ))}
        <div className="d-flex justify-content-between small">
          <span style={{ color: "var(--egse-text-secondary)" }}>CRC Status</span>
          <span className="egse-mono">
            {isCrcValid ? "🟢" : "🔴"} {crcDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}

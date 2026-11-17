import { STATUS_LABELS } from "../../utils/formatters";

/**
 * Small pill showing a semantic telemetry status (nominal/warning/alarm/raw).
 * `level` accepts: "nominal" | "warning" | "alarm" | "raw" | "neutral"
 */
export default function StatusChip({ level = "neutral", label, withDot = true, title }) {
  const text = label || STATUS_LABELS[level] || level;
  return (
    <span className={`egse-chip egse-chip-${level}`} title={title}>
      {withDot && <span className={`egse-dot egse-dot-${level === "neutral" ? "raw" : level}`} />}
      {text}
    </span>
  );
}

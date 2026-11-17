import { toStatus } from "../../../utils/formatters";

export default function StatsRow({ series, unit }) {
  if (!series.length) {
    return (
      <div className="small" style={{ color: "var(--egse-text-muted)" }}>
        No samples in this range.
      </div>
    );
  }

  // Invalid readings are null (shown as gaps); they must not count as 0 in the statistics.
  const values = series.map((s) => s.value).filter((v) => Number.isFinite(v));
  if (!values.length) {
    return (
      <div className="small" style={{ color: "var(--egse-text-muted)" }}>
        No valid readings in this range.
      </div>
    );
  }
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const avg = sum / values.length;

  // Same rule as the backend counters: valid readings only, with ALARM and CRITICAL as one state
  const outOfLimitCount = series.filter((s) => {
    if (!Number.isFinite(s.value)) return false;
    const status = toStatus(s.status);
    return status === "warning" || status === "alarm";
  }).length;

  const stats = [
    { label: "Min", value: `${min.toFixed(2)} ${unit}` },
    { label: "Max", value: `${max.toFixed(2)} ${unit}` },
    { label: "Average", value: `${avg.toFixed(2)} ${unit}` },
    { label: "Samples", value: `${values.length}${values.length !== series.length ? ` / ${series.length}` : ""}` },
    {
      label: "Out of Limit",
      value: String(outOfLimitCount),
      color: outOfLimitCount > 0 ? "var(--egse-warning, #f59e0b)" : undefined,
    },
  ];

  return (
    <div className="row g-2">
      {stats.map((s) => (
        <div className="col-6 col-sm-4 col-md" key={s.label}>
          <div className="egse-panel p-2 text-center" style={{ background: "var(--egse-bg-raised)" }}>
            <div className="small" style={{ color: "var(--egse-text-secondary)" }}>
              {s.label}
            </div>
            <div className="egse-mono fw-semibold" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

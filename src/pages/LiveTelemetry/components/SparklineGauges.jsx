function Sparkline({ values, status }) {
  const width = 160;
  const height = 40;
  const validValues = (values || [])
    .map((v) => (typeof v === "object" && v !== null ? v.value : v))
    .filter((v) => v !== null && v !== undefined)
    .map((v) => Number(v))
    .filter((v) => !isNaN(v) && isFinite(v));

  if (validValues.length < 2) {
    return <svg width={width} height={height} />;
  }
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;
  const step = width / (validValues.length - 1);
  const points = validValues
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");

  const color =
    status === "invalid" ? "#c084fc" : status === "alarm" ? "var(--egse-alarm)" : status === "warning" ? "var(--egse-warning)" : "var(--egse-nominal)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function SparklineGauges({ params, parameters, history = {} }) {
  const paramList = params || parameters || [];
  const numericParams = paramList.filter((p) => p.kind === "numeric");

  return (
    <div className="egse-panel">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">📈 Quick Live Gauges — Last 60s</h3>
      </div>
      <div className="egse-panel-body">
        <div className="egse-sparkline-strip">
          {numericParams.map((def, idx) => {
            const hist = history[def.id] || history[def.name] || [];
            const last = hist[hist.length - 1];
            const lastValue = typeof last === "object" && last !== null ? last.value : last;
            const lastStatus = typeof last === "object" && last !== null ? (last.status === "normal" ? "nominal" : last.status) : "nominal";
            return (
              <div key={def.id || def.name || `gauge-${idx}`} className="d-flex flex-column">
                <div className="d-flex justify-content-between small mb-1">
                  <span style={{ color: "var(--egse-text-secondary)" }}>{def.label || def.name}</span>
                  <span className="egse-mono">{lastValue ?? "—"}</span>
                </div>
                <Sparkline values={hist} status={lastStatus} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import React from "react";

const STATUS_CONFIG = [
  { key: "normal", label: "Normal (Nominal)", color: "#10b981", badgeClass: "bg-success" },
  { key: "warning", label: "Warning", color: "#f59e0b", badgeClass: "bg-warning text-dark" },
  { key: "alarm", label: "Critical / Alarm", color: "#ef4444", badgeClass: "bg-danger" },
  { key: "invalid", label: "Invalid", color: "#c084fc", badgeClass: "bg-purple" },
  { key: "unmonitored", label: "Unmonitored", color: "#94a3b8", badgeClass: "bg-secondary" },
];

export default function HealthDonutChart({ statusCounts, size = 160 }) {
  const invalidCount = Number(statusCounts?.invalid) || 0;
  const rawUnmonitored = Number(statusCounts?.unmonitored) || 0;
  const unmonitoredCount = Math.max(0, rawUnmonitored - invalidCount);

  const counts = {
    normal: Number(statusCounts?.normal) || 0,
    warning: Number(statusCounts?.warning) || 0,
    alarm: Number(statusCounts?.alarm) || 0,
    invalid: invalidCount,
    unmonitored: unmonitoredCount,
  };

  const total = counts.normal + counts.warning + counts.alarm + counts.invalid + counts.unmonitored;
  const normalPercentage = total > 0 ? Math.round((counts.normal / total) * 100) : 0;

  // SVG Geometry
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Build stroke slices
  let accumulatedOffset = 0;
  const slices = [];

  if (total > 0) {
    STATUS_CONFIG.forEach((cfg) => {
      const count = counts[cfg.key];
      if (count > 0) {
        const ratio = count / total;
        const strokeLength = ratio * circumference;
        slices.push({
          key: cfg.key,
          color: cfg.color,
          dashArray: `${strokeLength} ${circumference - strokeLength}`,
          dashOffset: -accumulatedOffset,
        });
        accumulatedOffset += strokeLength;
      }
    });
  }

  return (
    <div
      className="d-flex flex-column flex-sm-row align-items-center justify-content-center gap-4 py-2"
      data-testid="health-donut-chart"
    >
      {/* SVG Donut */}
      <div className="position-relative d-inline-flex align-items-center justify-content-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Satellite Telemetry Health Status Donut Chart"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Base Background Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="var(--egse-border-soft, rgba(255, 255, 255, 0.08))"
            strokeWidth={strokeWidth}
          />

          {/* Slices */}
          {slices.map((slice) => (
            <circle
              key={slice.key}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={slice.dashArray}
              strokeDashoffset={slice.dashOffset}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease" }}
            />
          ))}
        </svg>

        {/* Center Readout */}
        <div className="position-absolute text-center d-flex flex-column align-items-center justify-content-center">
          {total > 0 ? (
            <>
              <span className="fs-4 fw-bold" style={{ color: "var(--egse-text-primary, #fff)", lineHeight: 1.1 }}>
                {normalPercentage}%
              </span>
              <span className="small text-muted" style={{ fontSize: "0.68rem", letterSpacing: "0.03em" }}>
                HEALTHY
              </span>
            </>
          ) : (
            <>
              <span className="fs-5 fw-bold text-muted">0</span>
              <span className="small text-muted" style={{ fontSize: "0.68rem" }}>
                NO DATA
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend & Exact Count Breakdown */}
      <div className="d-flex flex-column gap-2 flex-grow-1" style={{ minWidth: "180px", maxWidth: "260px" }}>
        {STATUS_CONFIG.map((cfg) => {
          const count = counts[cfg.key];
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
          return (
            <div
              key={cfg.key}
              className="d-flex align-items-center justify-content-between p-2 rounded"
              style={{
                backgroundColor: "var(--egse-bg-raised, rgba(255, 255, 255, 0.02))",
                border: "1px solid var(--egse-border-soft, rgba(255, 255, 255, 0.06))",
                fontSize: "0.82rem",
              }}
              data-testid={`legend-${cfg.key}`}
            >
              <div className="d-flex align-items-center gap-2">
                <span
                  className="rounded-circle d-inline-block"
                  style={{
                    width: 9,
                    height: 9,
                    backgroundColor: cfg.color,
                    boxShadow: `0 0 6px ${cfg.color}66`,
                  }}
                />
                <span className="fw-medium" style={{ color: "var(--egse-text-secondary, #cbd5e1)" }}>
                  {cfg.label}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="fw-bold" style={{ color: "var(--egse-text-primary, #fff)" }}>
                  {count.toLocaleString('en-US')}
                </span>
                <span className="text-muted" style={{ fontSize: "0.74rem" }}>
                  ({pct}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Finds stretches of time with no telemetry samples in a time-ordered series.
// A gap is a spacing between two consecutive samples that is much larger than the usual spacing
// (median) — the chart then draws a hatched "No test data" band there instead of a misleading straight line.

export function detectGaps(series, { factor = 5 } = {}) {
  const points = series.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  if (points.length < 4) return [];

  const deltas = [];
  for (let i = 1; i < points.length; i += 1) {
    const d = points[i].t - points[i - 1].t;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length < 3) return [];

  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = median * factor;

  const gaps = [];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].t - points[i - 1].t > threshold) {
      gaps.push({ startT: points[i - 1].t, endT: points[i].t });
    }
  }
  return gaps;
}

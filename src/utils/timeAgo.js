/**
 * Utilities for calculating elapsed time and telemetry freshness.
 * Threshold: 120,000 ms (2 minutes).
 * Rationale: Aerospace telemetry downlinks arrive periodically (100ms - 30s).
 * Telemetry lacking new frames for > 2 minutes indicates LOS (Loss of Signal)
 * or stalled ingestion, requiring operator awareness.
 */

export const STALE_TELEMETRY_THRESHOLD_MS = 120000; // 2 minutes

export function formatTimeAgo(timestamp) {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (isNaN(time)) return null;

  const diffMs = Math.max(0, Date.now() - time);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return `Updated ${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Updated ${diffMin}m ago`;
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `Updated ${diffHr}h ago`;
  }
  const diffDays = Math.floor(diffHr / 24);
  return `Updated ${diffDays}d ago`;
}

export function isTelemetryStale(timestamp, thresholdMs = STALE_TELEMETRY_THRESHOLD_MS) {
  if (!timestamp) return true;
  const time = new Date(timestamp).getTime();
  if (isNaN(time)) return true;
  return (Date.now() - time) > thresholdMs;
}

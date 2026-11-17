import { useEffect, useState } from "react";

/**
 * Tells the user when a project's telemetry was replaced, so data already on screen
 * is reloaded instead of being mixed with newer results.
 */
export default function TelemetryDatasetNotice() {
  const [state, setState] = useState(null);

  useEffect(() => {
    const onChanged = () => setState("changed");
    const onUpdating = () => setState((current) => current || "updating");
    window.addEventListener("egse:telemetry-dataset-changed", onChanged);
    window.addEventListener("egse:telemetry-dataset-updating", onUpdating);
    return () => {
      window.removeEventListener("egse:telemetry-dataset-changed", onChanged);
      window.removeEventListener("egse:telemetry-dataset-updating", onUpdating);
    };
  }, []);

  useEffect(() => {
    if (state !== "updating") return undefined;
    const timer = setTimeout(() => setState(null), 8000);
    return () => clearTimeout(timer);
  }, [state]);

  if (!state) return null;

  return (
    <div className="alert alert-info d-flex align-items-center justify-content-between gap-3 mb-3" role="status">
      <span>
        {state === "changed"
          ? "Telemetry for this project was updated. Reload to see the complete new data."
          : "Telemetry for this project is being updated. Retrying automatically."}
      </span>
      {state === "changed" && (
        <button type="button" className="btn btn-sm btn-egse-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      )}
    </div>
  );
}

export default function SavedFramesList({ frames = [], onDelete }) {
  const safeFrames = Array.isArray(frames) ? frames : [];

  return (
    <div className="egse-panel">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">Saved Frames (this project)</h3>
        <span className="egse-chip egse-chip-neutral">{safeFrames.length}</span>
      </div>
      <div className="egse-panel-body d-flex flex-column gap-2">
        {safeFrames.length === 0 ? (
          <div className="small" style={{ color: "var(--egse-text-muted)" }}>
            No frames added yet.
          </div>
        ) : safeFrames.map((frame) => {
          const frameId = frame.id || frame._id;
          const parameters = Array.isArray(frame.parameters) ? frame.parameters : [];
          return (
            <div key={frameId} className="d-flex align-items-center justify-content-between gap-2 small">
              <span className="d-flex align-items-center gap-2 flex-wrap">
                <span className="egse-mono fw-semibold">{frame.name}</span>
                <span className="egse-chip egse-chip-raw">{frame.subsystem || "—"}</span>
                <span className="egse-chip egse-chip-neutral">{frame.protocol || "Generic"}</span>
                <span style={{ color: "var(--egse-text-muted)" }}>{parameters.length} parameter(s)</span>
              </span>
              <button
                type="button"
                className="btn btn-sm p-0 px-1"
                style={{ color: "var(--egse-alarm)", background: "none", border: "none" }}
                title="Delete frame"
                aria-label={`Delete ${frame.name || "frame"}`}
                onClick={() => onDelete?.(frameId)}
              >
                🗑️
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

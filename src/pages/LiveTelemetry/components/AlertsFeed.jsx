export default function AlertsFeed({ alerts = [], onClear }) {
  return (
    <div className="egse-panel">
      <div className="egse-panel-header d-flex align-items-center justify-content-between">
        <h3 className="egse-panel-title mb-0">🔔 Live Alerts Feed</h3>
        {alerts.length > 0 && onClear && (
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-muted small text-decoration-none"
            onClick={onClear}
            style={{ fontSize: "0.75rem" }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="egse-panel-body d-flex flex-column gap-2" style={{ maxHeight: 260, overflowY: "auto" }}>
        {alerts.length === 0 && (
          <div className="small" style={{ color: "var(--egse-text-muted)" }}>
            No alerts yet
          </div>
        )}
        {alerts.map((alert, idx) => (
          <div
            key={alert.id || `alert-${idx}`}
            className={`d-flex align-items-start gap-2 small ${alert.resolved ? "opacity-75" : ""}`}
          >
            <span
              data-testid={`alert-dot-${idx}`}
              className={`egse-dot ${alert.resolved ? "egse-dot-nominal" : `egse-dot-${alert.level}`} mt-1 flex-shrink-0`}
            />
            <span className="egse-mono flex-shrink-0" style={{ color: "var(--egse-text-muted)", minWidth: 62 }}>
              [{alert.time}]
            </span>
            <div className="flex-grow-1">
              <strong>{alert.subsystem}</strong> {alert.message}
              {alert.resolved ? (
                <>
                  <span
                    className="badge bg-success bg-opacity-20 text-success border border-success ms-1"
                    style={{ fontSize: "0.62rem", padding: "1px 4px" }}
                  >
                    RESOLVED
                  </span>
                  {alert.resolutionNote && (
                    <span className="text-muted ms-1 small" style={{ fontSize: "0.72rem" }}>
                      — {alert.resolutionNote}
                    </span>
                  )}
                </>
              ) : (
                <span
                  className="badge bg-danger bg-opacity-20 text-danger border border-danger ms-1"
                  style={{ fontSize: "0.62rem", padding: "1px 4px" }}
                >
                  {String(alert.level || "ALARM").toUpperCase()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

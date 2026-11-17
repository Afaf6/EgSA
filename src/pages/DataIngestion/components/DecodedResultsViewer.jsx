import { useState, useMemo } from "react";
import { Cpu, AlertTriangle, CheckCircle, Flame, Layers, Radio, Table, FileText } from "lucide-react";
import { uploadOutcomeTitle } from "../../../utils/uploadResult";

export default function DecodedResultsViewer({ stats, onReset, onNavigateLive }) {
  const [activeTab, setActiveTab] = useState("subsystems");
  const [selectedSubsystem, setSelectedSubsystem] = useState(null);

  const subsystems = useMemo(() => {
    if (!stats?.latestParametersBySubsystem) return [];
    return Object.keys(stats.latestParametersBySubsystem);
  }, [stats]);

  const activeSubsystemName = selectedSubsystem || subsystems[0] || "";
  const activeSubsystemData = stats?.latestParametersBySubsystem?.[activeSubsystemName] || null;

  // Log lines that are not frames are counted under "Non-telemetry lines", not as failed frames,
  // so the tab agrees with the "Invalid Frames" counter.
  const failedFrames = (stats?.failedFrames || []).filter((ff) => !ff?.nonTelemetry);
  const decodedPreview = stats?.decodedPreview || [];

  const getStatusBadge = (status) => {
    const s = String(status || "NORMAL").toUpperCase();
    if (s === "ALARM" || s === "CRITICAL") {
      return (
        <span
          className="badge d-inline-flex align-items-center gap-1 px-2 py-1"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            color: "#f87171",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            fontSize: "0.75rem",
          }}
        >
          <Flame size={12} /> ALARM
        </span>
      );
    }
    if (s === "INVALID") {
      return (
        <span
          className="badge d-inline-flex align-items-center gap-1 px-2 py-1"
          title="Reading is outside the parameter's valid range - check the sensor or configuration"
          style={{
            backgroundColor: "rgba(168, 85, 247, 0.15)",
            color: "#c084fc",
            border: "1px solid rgba(168, 85, 247, 0.5)",
            fontSize: "0.75rem",
          }}
        >
          INVALID
        </span>
      );
    }
    if (s === "WARNING" || s === "WARN") {
      return (
        <span
          className="badge d-inline-flex align-items-center gap-1 px-2 py-1"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            color: "#fbbf24",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            fontSize: "0.75rem",
          }}
        >
          <AlertTriangle size={12} /> WARNING
        </span>
      );
    }
    return (
      <span
        className="badge d-inline-flex align-items-center gap-1 px-2 py-1"
        style={{
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          color: "#34d399",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          fontSize: "0.75rem",
        }}
      >
        <CheckCircle size={12} /> NORMAL
      </span>
    );
  };

  const formatRawValue = (val) => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "number") {
      return `0x${(val >>> 0).toString(16).toUpperCase()} (${val})`;
    }
    return String(val);
  };

  const formatEngValue = (val, unit) => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "number") {
      return `${Number.isInteger(val) ? val : val.toFixed(3)} ${unit || ""}`.trim();
    }
    return `${val} ${unit || ""}`.trim();
  };

  return (
    <div className="d-flex flex-column gap-3 mt-3 animate-fade-in">
      {/* Top Banner & KPI Ribbon */}
      <div
        className="p-3 rounded border"
        style={{
          background: "linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(16, 185, 129, 0.08) 100%)",
          borderColor: "rgba(6, 182, 212, 0.3)",
        }}
      >
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              {!stats.outcome || stats.outcome === "success"
                ? <CheckCircle size={20} className="text-success" />
                : <AlertTriangle size={20} className={stats.outcome === "failed" ? "text-danger" : "text-warning"} />}
              <h3 className="egse-heading h6 mb-0 text-white">
                {uploadOutcomeTitle(stats.outcome)} · {stats.fileName}
              </h3>
            </div>
            <div className="small text-muted" style={{ fontSize: "0.8rem" }}>
              File processed: {(stats.totalBytes / 1024).toFixed(1)} KB · Total Lines: {stats.totalLines || "—"}
            </div>
            {stats.storedFileName && (
              <div className="small text-info mt-1" data-testid="stored-file-name">
                A different file named "{stats.renamedFrom}" is already stored, so this one was saved as "{stats.storedFileName}".
              </div>
            )}
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            {onNavigateLive && (
              <button
                className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
                onClick={onNavigateLive}
              >
                <Radio size={14} /> Open Live Stream
              </button>
            )}
            <button
              className="btn btn-sm btn-egse-outline"
              onClick={onReset}
            >
              Upload Another Log
            </button>
          </div>
        </div>

        {/* Status Count Badges */}
        <div className="d-flex flex-wrap gap-2 mt-3 pt-2 border-top" style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Total Lines:</span>
            <strong className="text-light">{stats.totalLines ?? 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Total Frames:</span>
            <strong className="text-light">{stats.totalFrames ?? 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Valid Frames:</span>
            <strong className="text-success">{stats.validFrames ?? stats.framesDecoded ?? 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Invalid Frames:</span>
            <strong className="text-danger">{stats.rejectedFrames ?? stats.invalidFrames ?? failedFrames.length ?? 0}</strong>
          </div>
          {stats.nonTelemetryLines > 0 && (
            <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25" title="Log lines that are not telemetry frames. They are skipped and are not errors.">
              <span className="text-muted me-1">Non-telemetry lines:</span>
              <strong className="text-light">{stats.nonTelemetryLines}</strong>
            </div>
          )}
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Stored Records:</span>
            <strong className="text-info">{stats.storedRecords ?? 0}</strong>
          </div>
          {stats.linkedRecords > 0 && (
            <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25" title="Part of Stored Records. These frames were already stored by another file, and this file now shares them.">
              <span className="text-muted me-1">Linked from other files:</span>
              <strong className="text-info">{stats.linkedRecords}</strong>
            </div>
          )}
          {stats.crcFailedStored !== undefined && stats.crcFailedStored !== null && (
            <div
              className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25"
              id="crc-failed-stored-badge"
            >
              <span className="text-muted me-1">stored with CRC failure:</span>
              <strong className="text-warning">{stats.crcFailedStored}</strong>
            </div>
          )}
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Parameters:</span>
            <strong className="text-light">{stats.totalParameters || 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Normal:</span>
            <strong className="text-success">{stats.statusSummary?.normal || 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Warnings:</span>
            <strong className="text-warning">{stats.statusSummary?.warning || 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Alarms:</span>
            <strong className="text-danger">{stats.statusSummary?.alarm || 0}</strong>
          </div>
          <div className="px-2 py-1 rounded bg-dark bg-opacity-50 small border border-secondary border-opacity-25">
            <span className="text-muted me-1">Invalid:</span>
            <strong style={{ color: "#c084fc" }}>{stats.statusSummary?.invalid || 0}</strong>
          </div>
        </div>
      </div>

      {/* Main View Tabs */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 border-bottom pb-2" style={{ borderColor: "var(--egse-border-soft)" }}>
        <ul className="nav nav-pills gap-1">
          <li className="nav-item">
            <button
              className={`btn btn-sm d-flex align-items-center gap-1 ${
                activeTab === "subsystems" ? "btn-egse-primary" : "btn-egse-outline"
              }`}
              onClick={() => setActiveTab("subsystems")}
            >
              <Cpu size={14} /> Subsystem Parameters ({subsystems.length})
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`btn btn-sm d-flex align-items-center gap-1 ${
                activeTab === "frames" ? "btn-egse-primary" : "btn-egse-outline"
              }`}
              onClick={() => setActiveTab("frames")}
            >
              <Layers size={14} /> Decoded Frames Stream ({decodedPreview.length})
            </button>
          </li>
          {failedFrames.length > 0 && (
            <li className="nav-item">
              <button
                className={`btn btn-sm d-flex align-items-center gap-1 ${
                  activeTab === "failed" ? "btn-danger" : "btn-outline-danger"
                }`}
                onClick={() => setActiveTab("failed")}
              >
                <AlertTriangle size={14} /> Failed / Corrupt Frames ({failedFrames.length})
              </button>
            </li>
          )}
        </ul>
      </div>

      {/* TAB 1: Subsystem Parameters View */}
      {activeTab === "subsystems" && (
        <div>
          {/* Subsystem Sub-Tabs */}
          {subsystems.length > 1 && (
            <div className="d-flex flex-wrap gap-2 mb-3">
              {subsystems.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  className={`btn btn-sm ${
                    sub === activeSubsystemName ? "btn-info text-dark fw-bold" : "btn-egse-outline"
                  }`}
                  onClick={() => setSelectedSubsystem(sub)}
                >
                  {sub}
                  <span className="badge bg-dark text-light ms-2">
                    {stats.latestParametersBySubsystem?.[sub]?.parameters?.length || 0} params
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeSubsystemData ? (
            <div className="egse-panel">
              <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="d-flex align-items-center gap-2">
                  <Cpu size={17} className="text-info" />
                  <h4 className="egse-panel-title mb-0 fs-6">
                    {activeSubsystemData.subsystemName} (Code: {activeSubsystemData.subsystemCode})
                  </h4>
                  <span className="badge bg-dark text-muted border border-secondary small">
                    Frame: {activeSubsystemData.frameName}
                  </span>
                </div>
                <span className="small text-muted">
                  Showing {activeSubsystemData.parameters?.length || 0} decoded telemetry channels
                </span>
              </div>

              <div className="table-responsive" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table className="table egse-table table-sm table-hover mb-0">
                  <thead className="sticky-top bg-dark">
                    <tr>
                      <th style={{ width: "28%" }}>Parameter Name</th>
                      <th style={{ width: "22%" }}>Raw Value</th>
                      <th style={{ width: "24%" }}>Engineering Value</th>
                      <th style={{ width: "12%" }}>Unit</th>
                      <th style={{ width: "14%" }} className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSubsystemData.parameters?.map((p, idx) => (
                      <tr key={p.parameterId || idx}>
                        <td>
                          <div className="fw-semibold text-light">{p.parameterName}</div>
                          <div className="egse-mono text-muted" style={{ fontSize: "0.72rem" }}>
                            {p.parameterId}
                          </div>
                        </td>
                        <td className="egse-mono text-secondary small">
                          {formatRawValue(p.rawValue)}
                        </td>
                        <td className="egse-mono fw-bold" style={{ color: "var(--egse-raw)" }}>
                          {formatEngValue(p.engineeringValue, "")}
                        </td>
                        <td className="text-muted small">
                          {p.unit || "—"}
                        </td>
                        <td className="text-center">
                          {getStatusBadge(p.status)}
                        </td>
                      </tr>
                    ))}
                    {(!activeSubsystemData.parameters || activeSubsystemData.parameters.length === 0) && (
                      <tr>
                        <td colSpan="5" className="text-center py-4 text-muted small">
                          No decoded parameter readings found for this subsystem.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="egse-panel p-4 text-center text-muted small">
              No subsystem decoded data available.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Decoded Frames Stream */}
      {activeTab === "frames" && (
        <div className="egse-panel">
          <div className="egse-panel-header">
            <h4 className="egse-panel-title fs-6">Sample Decoded Packets (First {decodedPreview.length})</h4>
          </div>
          <div className="table-responsive" style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table className="table egse-table table-sm mb-0">
              <thead className="sticky-top bg-dark">
                <tr>
                  <th>#</th>
                  <th>Subsystem</th>
                  <th>Frame</th>
                  <th>Timestamp</th>
                  <th>CRC Check</th>
                  <th>Parameters Extracted</th>
                </tr>
              </thead>
              <tbody>
                {decodedPreview.map((f, i) => (
                  <tr key={i}>
                    <td className="text-muted">{f.frameIndex || i + 1}</td>
                    <td>
                      <span className="badge bg-dark text-info border border-secondary">
                        {f.subsystemName} ({f.subsystemCode})
                      </span>
                    </td>
                    <td>{f.frameName}</td>
                    <td className="egse-mono small text-secondary">
                      {f.timestamp ? new Date(f.timestamp).toISOString() : f.logTimestamp || "—"}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          f.crcStatus === "OK"
                            ? "bg-success bg-opacity-20 text-success border border-success"
                            : f.crcStatus === "FAIL"
                            ? "bg-danger bg-opacity-20 text-danger border border-danger"
                            : f.crcStatus === "CONFIG_ERROR"
                            ? "bg-warning bg-opacity-20 text-warning border border-warning"
                            : "bg-secondary bg-opacity-20 text-muted"
                        }`}
                      >
                        {f.crcStatus === "SKIPPED" ? "NOT CONFIGURED" : f.crcStatus || "NOT CONFIGURED"}
                      </span>
                    </td>
                    <td className="fw-semibold text-light">
                      {f.readings?.length || 0} channels
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Failed / Corrupt Frames Diagnostics */}
      {activeTab === "failed" && (
        <div className="egse-panel border-danger">
          <div className="egse-panel-header bg-danger bg-opacity-10 border-danger border-opacity-25">
            <div className="d-flex align-items-center gap-2">
              <AlertTriangle size={18} className="text-danger" />
              <h4 className="egse-panel-title fs-6 text-danger mb-0">
                Failed & Corrupted Frame Diagnostics ({failedFrames.length})
              </h4>
            </div>
          </div>
          <div className="table-responsive" style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table className="table egse-table table-sm mb-0">
              <thead className="sticky-top bg-dark">
                <tr>
                  <th style={{ width: "10%" }}>Line</th>
                  <th style={{ width: "15%" }}>Subsystem</th>
                  <th style={{ width: "40%" }}>Failure Reason</th>
                  <th style={{ width: "35%" }}>Log Line Snippet</th>
                </tr>
              </thead>
              <tbody>
                {failedFrames.map((ff, i) => (
                  <tr key={i}>
                    <td className="egse-mono text-warning">Line {ff.line || i + 1}</td>
                    <td>
                      <span className="badge bg-dark text-warning border border-warning">
                        {ff.subsystemCode || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="text-danger small">{ff.reason}</td>
                    <td className="egse-mono text-muted small" style={{ fontSize: "0.72rem" }}>
                      {ff.rawSnippet || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

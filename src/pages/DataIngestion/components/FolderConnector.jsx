import { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  selectSelectedProject,
} from "../../../redux/slices/projectsSlice";
import {
  fetchIngestionStatus,
  fetchIngestionFiles,
  saveIngestionSettings,
  testIngestionConnection,
  startIngestionWatcher,
  stopIngestionWatcher,
  setSettingsField,
  clearSettingsError,
  clearActionError,
  ingestionStateUpdated,
  ingestionFileUpdated,
  ingestionErrorOccurred,
  selectIngestionState,
  selectIngestionLastPollAt,
  selectIngestionLastError,
  selectIngestionSettings,
  selectIngestionSettingsLoading,
  selectIngestionSettingsError,
  selectIngestionSettingsSuccessMessage,
  selectIngestionTestLoading,
  selectIngestionTestResult,
  selectIngestionActionLoading,
  selectIngestionActionError,
  selectIngestionFiles,
  selectIngestionErrors,
} from "../../../redux/slices/ingestionSlice";
import socketService from "../../../services/socketService";
import { formatDateTime } from "../../../utils/formatters";
import {
  FolderLock,
  Play,
  Square,
  RefreshCw,
  FolderSync,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Layers,
  FileSpreadsheet,
  AlertOctagon,
  Settings2,
  ListFilter,
  Check,
  ChevronRight,
} from "lucide-react";

const NO_UPLOAD_PERMISSION = "You need the upload_telemetry permission to start or stop folder monitoring.";

// canUpload: starting/stopping a watcher ingests telemetry, so it needs upload_telemetry on the
// server. Viewing status and tracked files does not.
export default function FolderConnector({ projectId: propProjectId, canUpload = true }) {
  const dispatch = useDispatch();
  const selectedProject = useSelector(selectSelectedProject);
  const activeProjectId = propProjectId || selectedProject?._id || selectedProject?.id;

  const state = useSelector(selectIngestionState);
  const lastPollAt = useSelector(selectIngestionLastPollAt);
  const lastError = useSelector(selectIngestionLastError);
  const settings = useSelector(selectIngestionSettings) || {
    inputPath: "",
    outputPath: "",
    intervalSec: 5,
    maxFileSizeMB: 500,
  };
  const settingsLoading = useSelector(selectIngestionSettingsLoading);
  const settingsError = useSelector(selectIngestionSettingsError);
  const settingsSuccessMessage = useSelector(selectIngestionSettingsSuccessMessage);
  const testLoading = useSelector(selectIngestionTestLoading);
  const testResult = useSelector(selectIngestionTestResult);
  const actionLoading = useSelector(selectIngestionActionLoading);
  const actionError = useSelector(selectIngestionActionError);
  const files = useSelector(selectIngestionFiles);
  const errors = useSelector(selectIngestionErrors);

  // Local form state so users can edit values before saving
  const [localInputPath, setLocalInputPath] = useState(settings.inputPath || "");
  const [localOutputPath, setLocalOutputPath] = useState(settings.outputPath || "");
  const [localInterval, setLocalInterval] = useState(settings.intervalSec || 5);
  const [localMaxFileSizeMB, setLocalMaxFileSizeMB] = useState(settings.maxFileSizeMB || 500);

  // Pagination for live files list
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Sync redux settings to local form if redux settings change externally
  useEffect(() => {
    if (settings.inputPath && !localInputPath) setLocalInputPath(settings.inputPath);
    if (settings.outputPath && !localOutputPath) setLocalOutputPath(settings.outputPath);
    if (settings.intervalSec) setLocalInterval(settings.intervalSec);
    if (settings.maxFileSizeMB) setLocalMaxFileSizeMB(settings.maxFileSizeMB);
  }, [settings]);

  // Initial load of watcher status and tracked files on mount / project change
  useEffect(() => {
    if (activeProjectId) {
      dispatch(fetchIngestionStatus(activeProjectId));
      dispatch(fetchIngestionFiles(activeProjectId));
    }
  }, [activeProjectId, dispatch]);

  // Socket room joining and event handling scoped to this project
  useEffect(() => {
    if (!activeProjectId) return;

    socketService.joinProject(activeProjectId);

    const unsubscribe = socketService.subscribe((event) => {
      if (!event || !event.type) return;

      const pId = String(event.data?.projectId || "");
      if (pId !== String(activeProjectId)) {
        return; // strictly ignore events from other projects
      }

      if (event.type === "ingestion:state") {
        dispatch(ingestionStateUpdated(event.data));
      } else if (event.type === "ingestion:file") {
        dispatch(ingestionFileUpdated(event.data));
      } else if (event.type === "ingestion:error") {
        dispatch(ingestionErrorOccurred(event.data));
      }
    });

    return () => {
      unsubscribe();
      socketService.leaveProject(activeProjectId);
    };
  }, [activeProjectId, dispatch]);

  // Form field changes
  const handleInputChange = (field, value) => {
    if (field === "inputPath") setLocalInputPath(value);
    if (field === "outputPath") setLocalOutputPath(value);
    if (field === "intervalSec") setLocalInterval(value);
    if (field === "maxFileSizeMB") setLocalMaxFileSizeMB(value);

    dispatch(setSettingsField({ field, value }));
  };

  // Save Settings handler
  const handleSaveSettings = (e) => {
    e.preventDefault();
    if (!activeProjectId) return;

    dispatch(
      saveIngestionSettings({
        projectId: activeProjectId,
        settings: {
          inputPath: localInputPath.trim(),
          outputPath: localOutputPath.trim() || null,
          intervalSec: Number(localInterval),
          maxFileSizeMB: Number(localMaxFileSizeMB),
        },
      })
    );
  };

  // Test Connection handler
  const handleTestConnection = () => {
    if (!activeProjectId) return;
    dispatch(
      testIngestionConnection({
        projectId: activeProjectId,
        paths: {
          inputPath: localInputPath.trim(),
          outputPath: localOutputPath.trim() || undefined,
        },
      })
    );
  };

  // Start / Stop Handlers
  const handleStartWatcher = () => {
    if (!activeProjectId) return;
    dispatch(startIngestionWatcher(activeProjectId));
  };

  const handleStopWatcher = () => {
    if (!activeProjectId) return;
    dispatch(stopIngestionWatcher(activeProjectId));
  };

  // State badge styling
  const getBadgeClass = (s) => {
    switch (s) {
      case "running":
        return "bg-success text-white border-success";
      case "disconnected":
        return "bg-danger text-white border-danger";
      case "stopped":
      default:
        return "bg-secondary text-white border-secondary";
    }
  };

  // Dynamic subfolder discovery & filtering (SF-12)
  const [activeSubfolderTab, setActiveSubfolderTab] = useState("all");

  const subfolders = useMemo(() => {
    const set = new Set();
    files.forEach((f) => {
      const sub = (f.subfolderName || "").trim();
      if (sub) set.add(sub);
    });
    return Array.from(set).sort();
  }, [files]);

  const displayedFiles = useMemo(() => {
    if (activeSubfolderTab === "all") return files;
    return files.filter((f) => (f.subfolderName || "").trim() === activeSubfolderTab);
  }, [files, activeSubfolderTab]);

  // Pagination calculation
  const totalPages = Math.ceil(displayedFiles.length / itemsPerPage) || 1;
  const paginatedFiles = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return displayedFiles.slice(start, start + itemsPerPage);
  }, [displayedFiles, currentPage, itemsPerPage]);

  const canStart = Boolean(localInputPath && localInputPath.trim().length > 0);

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. Header Card: Watcher State & Quick Actions */}
      <div
        className="p-3 rounded border"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          borderColor: "var(--egse-border-soft)",
        }}
      >
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-2">
            <FolderSync size={22} className="text-info" />
            <div>
              <div className="d-flex align-items-center gap-2">
                <h2 className="h5 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                  Shared Folder Telemetry Watcher
                </h2>
                <span
                  data-testid="watcher-state-badge"
                  className={`badge text-uppercase px-2 py-1 border ${getBadgeClass(state)}`}
                  style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}
                >
                  {state}
                </span>
              </div>
              <div className="small text-muted mt-1">
                {lastPollAt
                  ? `Last polled at: ${formatDateTime(lastPollAt)}`
                  : "Watcher ready. Polling inactive."}
                {lastError && (
                  <span className="text-danger ms-2">
                    <AlertTriangle size={14} className="inline me-1" />
                    {lastError}
                  </span>
                )}
              </div>
              <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                <span className="small text-uppercase fw-bold text-muted" style={{ fontSize: "0.7rem" }}>
                  Watched Folder:
                </span>
                <span
                  data-testid="watched-folder-path"
                  className="badge bg-dark text-info border border-secondary font-monospace px-2 py-1 text-break"
                  style={{ fontSize: "0.8rem", maxWidth: "600px" }}
                >
                  {settings?.inputPath || localInputPath || "Not Configured"}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="d-flex align-items-center gap-2">
            {state === "running" ? (
              <button
                type="button"
                className="btn btn-danger btn-sm d-inline-flex align-items-center gap-1 px-3"
                onClick={handleStopWatcher}
                disabled={actionLoading || !canUpload}
                title={!canUpload ? NO_UPLOAD_PERMISSION : ""}
              >
                {actionLoading ? <RefreshCw size={14} className="spin-anim" /> : <Square size={14} />}
                <span>Stop Monitoring</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-success btn-sm d-inline-flex align-items-center gap-1 px-3"
                onClick={handleStartWatcher}
                disabled={!canStart || actionLoading || !canUpload}
                title={!canUpload ? NO_UPLOAD_PERMISSION : (!canStart ? "Input folder path must be configured before starting" : "")}
              >
                {actionLoading ? <RefreshCw size={14} className="spin-anim" /> : <Play size={14} />}
                <span>Start Monitoring</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
              onClick={() => activeProjectId && dispatch(fetchIngestionStatus(activeProjectId))}
              title="Refresh watcher state"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Action Error Alert (e.g. 409 ALREADY_RUNNING or FOLDER_ALREADY_WATCHED) */}
        {actionError && (
          <div
            data-testid="watcher-action-error"
            className="alert alert-danger d-flex align-items-center gap-2 mt-3 mb-0 py-2 small"
            role="alert"
          >
            <AlertOctagon size={16} className="text-danger shrink-0" />
            <div className="flex-grow-1">{actionError}</div>
            <button
              type="button"
              className="btn btn-sm btn-link text-danger p-0"
              onClick={() => dispatch(clearActionError())}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. Settings Panel & Test Connection Result */}
      <div className="row g-3">
        {/* Settings Form */}
        <div className="col-12 col-lg-7">
          <div
            className="p-3 rounded border h-100"
            style={{
              backgroundColor: "var(--egse-bg-panel)",
              borderColor: "var(--egse-border-soft)",
            }}
          >
            <div className="d-flex align-items-center gap-2 mb-3">
              <Settings2 size={18} className="text-info" />
              <h3 className="h6 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                Watcher Folder Settings
              </h3>
            </div>

            <form onSubmit={handleSaveSettings} className="d-flex flex-column gap-3">
              {/* Input Path */}
              <div>
                <label htmlFor="inputPath" className="form-label small fw-semibold text-secondary mb-1">
                  Input Folder Path <span className="text-danger">*</span>
                </label>
                <input
                  id="inputPath"
                  type="text"
                  className="form-control form-control-sm egse-field egse-mono"
                  placeholder="\\ground-station\telemetry\incoming or C:\Telemetry\Incoming"
                  value={localInputPath}
                  onChange={(e) => handleInputChange("inputPath", e.target.value)}
                  required
                />
                <div className="form-text small text-muted">
                  Network share (UNC) or local absolute directory watched read-only.
                </div>
              </div>

              {/* Output Path (Optional) */}
              <div>
                <label htmlFor="outputPath" className="form-label small fw-semibold text-secondary mb-1">
                  Output Folder Path <span className="text-muted">(Optional Decoded CSV / Excel Export)</span>
                </label>
                <input
                  id="outputPath"
                  type="text"
                  className="form-control form-control-sm egse-field egse-mono"
                  placeholder="\\ground-station\telemetry\decoded or C:\Telemetry\Decoded"
                  value={localOutputPath}
                  onChange={(e) => handleInputChange("outputPath", e.target.value)}
                />
                <div className="form-text small text-muted">
                  Must be outside the input folder. Decoded exports will be written here atomically.
                </div>
              </div>

              {/* Polling Interval & Max File Size */}
              <div className="row g-2">
                <div className="col-6">
                  <label htmlFor="intervalSec" className="form-label small fw-semibold text-secondary mb-1">
                    Polling Interval (Seconds)
                  </label>
                  <input
                    id="intervalSec"
                    type="number"
                    min="2"
                    className="form-control form-control-sm egse-field"
                    value={localInterval}
                    onChange={(e) => handleInputChange("intervalSec", e.target.value)}
                  />
                  <div className="form-text small text-muted">Minimum 2 seconds (default 5).</div>
                </div>

                <div className="col-6">
                  <label htmlFor="maxFileSizeMB" className="form-label small fw-semibold text-secondary mb-1">
                    Max File Size (MB)
                  </label>
                  <input
                    id="maxFileSizeMB"
                    type="number"
                    min="1"
                    className="form-control form-control-sm egse-field"
                    value={localMaxFileSizeMB}
                    onChange={(e) => handleInputChange("maxFileSizeMB", e.target.value)}
                  />
                  <div className="form-text small text-muted">Files over this cap are rejected safely.</div>
                </div>
              </div>

              {/* Inline validation errors from server (400 responses) */}
              {settingsError && (
                <div
                  data-testid="settings-inline-error"
                  className="alert alert-danger d-flex align-items-center gap-2 mb-0 py-2 small"
                >
                  <AlertTriangle size={16} className="text-danger shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {/* Inline success message */}
              {settingsSuccessMessage && (
                <div className="alert alert-success d-flex align-items-center gap-2 mb-0 py-2 small">
                  <CheckCircle2 size={16} className="text-success shrink-0" />
                  <span>{settingsSuccessMessage}</span>
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="d-flex align-items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="btn btn-info btn-sm px-3"
                  disabled={settingsLoading}
                >
                  {settingsLoading ? (
                    <>
                      <RefreshCw size={14} className="spin-anim me-1" /> Saving...
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-outline-info btn-sm px-3"
                  onClick={handleTestConnection}
                  disabled={testLoading || !localInputPath.trim()}
                >
                  {testLoading ? (
                    <>
                      <RefreshCw size={14} className="spin-anim me-1" /> Testing...
                    </>
                  ) : (
                    "Test Connection"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Test Connection Results Panel */}
        <div className="col-12 col-lg-5">
          <div
            className="p-3 rounded border h-100 d-flex flex-column"
            style={{
              backgroundColor: "var(--egse-bg-panel)",
              borderColor: "var(--egse-border-soft)",
            }}
          >
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h3 className="h6 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                Connection Verification
              </h3>
              {testResult && (
                <span
                  data-testid={testResult.valid ? "connection-result-pass" : "connection-result-fail"}
                  className={`badge d-inline-flex align-items-center gap-1 ${
                    testResult.valid
                      ? "bg-success bg-opacity-20 text-success border border-success"
                      : "bg-danger bg-opacity-20 text-danger border border-danger"
                  }`}
                  style={{ fontSize: "0.8rem" }}
                >
                  {testResult.valid ? "✅ VALID" : "🔴 INVALID"}
                </span>
              )}
            </div>

            {!testResult && !testLoading && (
              <div className="text-muted small my-auto text-center py-4">
                Click <strong>Test Connection</strong> to verify folder accessibility, permissions, and file eligibility.
              </div>
            )}

            {testLoading && (
              <div className="text-muted small my-auto text-center py-4">
                <RefreshCw size={24} className="spin-anim text-info mb-2" />
                <div>Probing input and output folders...</div>
              </div>
            )}

            {testResult && (
              <div className="d-flex flex-column gap-2 small">
                {/* Specific checks list */}
                {Array.isArray(testResult.checks) && testResult.checks.length > 0 ? (
                  testResult.checks.map((chk, i) => (
                    <div
                      key={chk.name || i}
                      className={`p-2 rounded border d-flex align-items-start gap-2 ${
                        chk.passed
                          ? "bg-success bg-opacity-10 border-success border-opacity-25"
                          : "bg-danger bg-opacity-10 border-danger border-opacity-25"
                      }`}
                    >
                      {chk.passed ? (
                        <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={16} className="text-danger shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="fw-semibold">
                          <code>{chk.name}</code>: {chk.message}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted">No individual checks reported.</div>
                )}

                {/* Input folder summary */}
                {testResult.input && (
                  <div className="p-2 rounded border bg-dark bg-opacity-25 border-secondary border-opacity-25 mt-1">
                    <span className="text-secondary fw-bold d-block">Input Summary:</span>
                    <span className="text-muted">
                      {testResult.input.eligibleFilesCount !== undefined
                        ? `${testResult.input.eligibleFilesCount} eligible telemetry files found.`
                        : testResult.input.message || "Inspected"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Live File List & Ingestion Feed */}
      <div
        className="rounded border overflow-hidden"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          borderColor: "var(--egse-border-soft)",
        }}
      >
        <div className="p-3 border-bottom d-flex align-items-center justify-content-between gap-2 flex-wrap" style={{ borderColor: "var(--egse-border-soft)" }}>
          <div className="d-flex align-items-center gap-2">
            <Layers size={18} className="text-info" />
            <h3 className="h6 mb-0 fw-bold" style={{ color: "var(--egse-text-primary)" }}>
              Live Tracked Files ({files.length})
            </h3>
          </div>
          <div className="d-flex align-items-center gap-2 small text-muted">
            <span className="badge bg-dark border border-secondary text-secondary">
              Real-time WebSocket Sync
            </span>
          </div>
        </div>

        {/* Subfolder Filter Tabs (SF-12) */}
        {subfolders.length > 0 && (
          <div
            role="tablist"
            aria-label="Subfolders"
            className="p-3 pb-2 border-bottom d-flex align-items-center gap-1 flex-wrap"
            style={{ borderColor: "var(--egse-border-soft)", backgroundColor: "var(--egse-bg-raised)" }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSubfolderTab === "all"}
              className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded ${
                activeSubfolderTab === "all" ? "btn-info shadow-sm" : "btn-link text-decoration-none"
              }`}
              style={{
                color: activeSubfolderTab === "all" ? "#000" : "var(--egse-text-secondary)",
                fontWeight: activeSubfolderTab === "all" ? "600" : "normal",
                fontSize: "0.82rem",
              }}
              onClick={() => {
                setActiveSubfolderTab("all");
                setCurrentPage(1);
              }}
            >
              All ({files.length})
            </button>
            {subfolders.map((sub) => {
              const count = files.filter((f) => (f.subfolderName || "").trim() === sub).length;
              return (
                <button
                  key={sub}
                  type="button"
                  role="tab"
                  aria-selected={activeSubfolderTab === sub}
                  className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded ${
                    activeSubfolderTab === sub ? "btn-info shadow-sm" : "btn-link text-decoration-none"
                  }`}
                  style={{
                    color: activeSubfolderTab === sub ? "#000" : "var(--egse-text-secondary)",
                    fontWeight: activeSubfolderTab === sub ? "600" : "normal",
                    fontSize: "0.82rem",
                  }}
                  onClick={() => {
                    setActiveSubfolderTab(sub);
                    setCurrentPage(1);
                  }}
                >
                  {sub} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Files Table */}
        {displayedFiles.length === 0 ? (
          <div className="p-5 text-center text-muted small">
            <FileText size={36} className="text-secondary mb-2 opacity-50" />
            <h6 className="fw-bold mb-1" style={{ color: "var(--egse-text-primary)" }}>
              No files detected yet
            </h6>
            <p className="mb-0 text-muted">
              When the shared folder watcher is active, discovered telemetry files (.txt, .log) will appear here live with processing progress.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ color: "var(--egse-text-primary)" }}>
              <thead
                style={{
                  backgroundColor: "var(--egse-bg-raised)",
                  borderBottom: "1px solid var(--egse-border-soft)",
                  color: "var(--egse-text-secondary)",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                }}
              >
                <tr>
                  <th scope="col" className="ps-3">File Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Records</th>
                  <th scope="col">Counters (V / Inv / Dup / Cor)</th>
                  <th scope="col">Decoded Output</th>
                  <th scope="col">Error / Warning</th>
                  <th scope="col" className="pe-3">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFiles.map((file) => {
                  const counters = file.counters || {};
                  const rowKey = `${file.subfolderName || ""}:${file.fileName}`;
                  return (
                    <tr key={rowKey} style={{ fontSize: "0.85rem" }}>
                      <td className="ps-3 fw-mono fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                        {file.fileName}
                        {file.subfolderName && (
                          <span
                            className="badge ms-2"
                            style={{
                              backgroundColor: "rgba(14, 165, 233, 0.15)",
                              color: "#38bdf8",
                              border: "1px solid rgba(14, 165, 233, 0.3)",
                              fontSize: "0.68rem",
                              fontWeight: "normal",
                            }}
                          >
                            {file.subfolderName}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            file.status === "done"
                              ? "bg-success bg-opacity-20 text-success border border-success text-uppercase"
                              : file.status === "processing" || file.status === "growing"
                              ? "bg-info bg-opacity-20 text-info border border-info text-uppercase"
                              : file.status === "duplicate"
                              ? "bg-secondary bg-opacity-25 text-muted border border-secondary"
                              : file.status === "failed" || file.status === "rejected"
                              ? "bg-danger bg-opacity-20 text-danger border border-danger text-uppercase"
                              : "bg-secondary bg-opacity-20 text-secondary border border-secondary text-uppercase"
                          }`}
                          style={file.status === "duplicate" ? { textTransform: "none", fontWeight: 500 } : {}}
                        >
                          {file.status === "duplicate" ? "Duplicate (skipped)" : file.status}
                        </span>
                      </td>
                      <td className="fw-mono">
                        {counters.storedRecords !== undefined ? `${counters.storedRecords} rec` : "0 rec"}
                        <span className="text-muted small ms-1">({counters.lines || 0} lines)</span>
                      </td>
                      <td className="fw-mono small">
                        <span className="text-success" title="Valid">{counters.valid ?? 0}</span> /{" "}
                        <span className="text-warning" title="Invalid">{counters.invalid ?? 0}</span> /{" "}
                        <span className="text-info" title="Duplicates">{counters.duplicate ?? 0}</span> /{" "}
                        <span className="text-danger" title="Corrupt">{counters.corrupt ?? 0}</span>
                      </td>
                      <td>
                        {file.outputStatus ? (
                          <span
                            className={`badge ${
                              file.outputStatus === "written"
                                ? "bg-success bg-opacity-20 text-success"
                                : file.outputStatus === "failed"
                                ? "bg-danger bg-opacity-20 text-danger"
                                : "bg-dark text-muted"
                            }`}
                          >
                            {file.outputStatus}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {file.lastError ? (
                          <span className="text-danger small" title={file.lastError}>
                            {file.lastError}
                          </span>
                        ) : file.lastWarning ? (
                          <span className="text-warning small" title={file.lastWarning}>
                            {file.lastWarning}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="pe-3 text-muted small">
                        {file.updatedAt ? formatDateTime(file.updatedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls following DecodedFilesTable pattern */}
        {totalPages > 1 && (
          <div
            className="p-3 border-top d-flex align-items-center justify-content-between gap-2"
            style={{ borderColor: "var(--egse-border-soft)", fontSize: "0.85rem" }}
          >
            <div style={{ color: "var(--egse-text-muted)" }}>
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> (Total {files.length} files)
            </div>
            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                Previous
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`btn btn-sm ${isActive ? "btn-info" : "btn-outline-secondary"}`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Real-time Errors Stream (if any) */}
      {errors.length > 0 && (
        <div
          className="p-3 rounded border"
          style={{
            backgroundColor: "var(--egse-bg-panel)",
            borderColor: "var(--egse-border-soft)",
          }}
        >
          <div className="d-flex align-items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-warning" />
            <h3 className="h6 mb-0 fw-bold text-warning">Processing & Connection Errors</h3>
          </div>
          <div className="d-flex flex-column gap-2 small">
            {errors.slice(0, 5).map((err) => (
              <div
                key={err.id}
                className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex justify-content-between align-items-center"
              >
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-danger text-white">{err.type || "error"}</span>
                  {err.fileName && <strong className="text-light">{err.fileName}:</strong>}
                  <span className="text-danger-subtle">{err.error || err.message}</span>
                </div>
                <span className="text-muted">{formatDateTime(err.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import telemetryService from "../../../services/telemetryService";
import {
  Zap,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Info,
  Clock,
  Cpu,
  Layers,
  FileText,
  ShieldCheck,
  Hash,
  RotateCcw,
} from "lucide-react";

const NON_RECOMPUTABLE_TYPES = new Set(["hex", "hex_string", "bitfield", "string", "boolean"]);

function describeJobScope(job) {
  const scope = job.scope || {};
  const parts = [];
  if (scope.frameName) parts.push(`Frame ${scope.frameName}`);
  else if (scope.subsystemName) parts.push(`Subsystem ${scope.subsystemName}`);
  else parts.push("Entire project");
  if (scope.sourceFile) parts.push(`file ${scope.sourceFile}`);
  return parts.join(", ");
}

export default function RecomputeModal({
  isOpen,
  onClose,
  projectId,
  projectName = "",
  initialScope = "",
  selectedSubsystemId = "",
  selectedFrameId = "",
  selectedSourceFile = "",
  subsystems = [],
  currentFrame = null,
  configuredParameters = [],
  staleParameters = {},
  onSuccess = null,
}) {
  if (!isOpen) return null;

  return (
    <RecomputeModalContent
      onClose={onClose}
      projectId={projectId}
      projectName={projectName}
      initialScope={initialScope}
      selectedSubsystemId={selectedSubsystemId}
      selectedFrameId={selectedFrameId}
      selectedSourceFile={selectedSourceFile}
      subsystems={subsystems}
      currentFrame={currentFrame}
      configuredParameters={configuredParameters}
      staleParameters={staleParameters}
      onSuccess={onSuccess}
    />
  );
}

function RecomputeModalContent({
  onClose,
  projectId,
  projectName,
  initialScope,
  selectedSubsystemId,
  selectedFrameId,
  selectedSourceFile,
  subsystems,
  currentFrame,
  configuredParameters,
  staleParameters,
  onSuccess,
}) {
  // Scope selection: 'frame' | 'subsystem' | 'project'
  const [scope, setScope] = useState(initialScope || (selectedFrameId ? "frame" : "project"));
  const [filterByFile, setFilterByFile] = useState(Boolean(selectedSourceFile));
  
  // Parameters with equations
  const parametersWithEquations = useMemo(() => {
    return (configuredParameters || []).filter(
      (p) => typeof p.equation === "string" && p.equation.trim().length > 0
    );
  }, [configuredParameters]);

  // Numeric parameters of the current frame; nothing selected means every stale parameter
  const selectableParameters = useMemo(() => {
    const isStale = (p) => Boolean(staleParameters?.[p._id || p.id]);
    return (configuredParameters || [])
      .filter((p) => (p._id || p.id) && !NON_RECOMPUTABLE_TYPES.has(String(p.dataType || "").toLowerCase()))
      .sort((a, b) => Number(isStale(b)) - Number(isStale(a)));
  }, [configuredParameters, staleParameters]);
  const [selectedParameterIds, setSelectedParameterIds] = useState([]);
  const [resumableJobs, setResumableJobs] = useState([]);

  const toggleParameter = (id) => {
    setSelectedParameterIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const loadResumableJobs = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await telemetryService.listRecomputeJobs(projectId);
      const jobs = res?.data ?? res;
      setResumableJobs(Array.isArray(jobs) ? jobs : []);
    } catch {
      setResumableJobs([]);
    }
  }, [projectId]);

  useEffect(() => {
    loadResumableJobs();
  }, [loadResumableJobs]);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const pollTimerRef = useRef(null);

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const followJob = (data) => {
    if (data?.jobId) {
      setJobId(data.jobId);
      if (data.status === "completed" || data.status === "done") {
        setIsRunning(false);
        setExecutionResult(data.result || data);
        loadResumableJobs();
        if (onSuccess) onSuccess();
      } else {
        // Poll MongoDB job status
        pollTimerRef.current = setInterval(async () => {
          try {
            const statusRes = await telemetryService.getRecomputeStatus(data.jobId, projectId);
            const statusData = statusRes?.data || statusRes;
            setJobProgress(statusData);

            if (statusData?.status === "completed" || statusData?.status === "done") {
              clearInterval(pollTimerRef.current);
              setIsRunning(false);
              setExecutionResult(statusData.result || statusData);
              loadResumableJobs();
              if (onSuccess) onSuccess();
            } else if (statusData?.status === "failed" || statusData?.status === "interrupted") {
              clearInterval(pollTimerRef.current);
              setIsRunning(false);
              setErrorMessage(statusData.lastError || statusData.error || `Recomputation ended with status: ${statusData?.status}`);
              loadResumableJobs();
            }
          } catch (err) {
            clearInterval(pollTimerRef.current);
            setIsRunning(false);
            setErrorMessage(err?.message || "Failed to poll job status.");
          }
        }, 600);
      }
    } else {
      setIsRunning(false);
      setExecutionResult(data);
      if (onSuccess) onSuccess();
    }
  };

  const handleResume = async (job) => {
    if (isRunning) return;
    setIsRunning(true);
    setErrorMessage("");
    setExecutionResult(null);
    setJobProgress(null);
    try {
      const res = await telemetryService.resumeRecomputeJob(job.id || job._id, projectId);
      followJob(res?.data || res);
    } catch (err) {
      setIsRunning(false);
      setErrorMessage(err?.response?.data?.message || err?.message || "Failed to resume the recompute job.");
      loadResumableJobs();
    }
  };

  const handleStartRecompute = async () => {
    if (!projectId || isRunning) return;

    if (scope === "frame" && !selectedFrameId) {
      setErrorMessage("Please select a frame for frame-scoped recompute.");
      return;
    }
    if (scope === "subsystem" && !selectedSubsystemId) {
      setErrorMessage("Please select a subsystem for subsystem-scoped recompute.");
      return;
    }
    if (filterByFile && !selectedSourceFile) {
      setErrorMessage("Please select a file to limit recompute to active file.");
      return;
    }

    setIsRunning(true);
    setErrorMessage("");
    setExecutionResult(null);
    setJobProgress(null);

    try {
      const payload = {
        projectId,
      };

      if (scope === "frame") {
        payload.frameId = selectedFrameId;
        if (selectedSubsystemId) {
          payload.subsystemId = selectedSubsystemId;
        }
      } else if (scope === "subsystem") {
        payload.subsystemId = selectedSubsystemId;
      }
      if (filterByFile && selectedSourceFile) {
        payload.sourceFile = selectedSourceFile;
      }
      if (scope === "frame" && selectedParameterIds.length > 0) {
        payload.parameterIds = selectedParameterIds;
      }

      const res = await telemetryService.recomputeTelemetry(payload);
      followJob(res?.data || res);
    } catch (err) {
      setIsRunning(false);
      setErrorMessage(
        err?.response?.data?.message || err?.message || "Failed to execute recomputation."
      );
    }
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)", zIndex: 1060 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div
          className="modal-content text-light shadow-lg border"
          style={{
            backgroundColor: "var(--egse-bg-panel, #121824)",
            borderColor: "var(--egse-border-soft, #2a3447)",
          }}
        >
          {/* Header */}
          <div
            className="modal-header d-flex align-items-center justify-content-between p-3"
            style={{ borderBottom: "1px solid var(--egse-border-soft, #2a3447)" }}
          >
            <div className="d-flex align-items-center gap-2">
              <div
                className="p-2 rounded d-flex align-items-center justify-content-center"
                style={{ backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#eab308" }}
              >
                <Zap size={20} />
              </div>
              <div>
                <h5 className="modal-title h6 mb-0 fw-bold">
                  Recompute Telemetry with Current Calculation Settings
                </h5>
                <span className="small text-muted" style={{ fontSize: "0.78rem" }}>
                  Reapply the current equation, scale and offset and update engineering values without reprocessing the source files
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={onClose}
              disabled={isRunning}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="modal-body p-4 d-flex flex-column gap-3">
            {/* Key Architectural & Idempotency Notices */}
            <div
              className="p-3 rounded border"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                borderColor: "rgba(59, 130, 246, 0.25)",
              }}
            >
              <div className="d-flex align-items-start gap-2">
                <Info size={18} className="text-info mt-1 flex-shrink-0" />
                <div className="small">
                  <div className="fw-bold text-white mb-1">
                    Architectural & Execution Guarantees
                  </div>
                  <ul className="mb-1 ps-3 text-muted" style={{ lineHeight: 1.5 }}>
                    <li>
                      <strong>Idempotent:</strong> Re-running Recompute is completely idempotent. Only readings whose stored calculation hash differs from the current configuration will be updated.
                    </li>
                    <li>
                      <strong>MongoDB Job Tracking:</strong> Recompute job progress is persisted in MongoDB per batch with crash recovery, restart safety, and resumption support.
                    </li>
                    <li>
                      <strong>Targeted Updates:</strong> Uses atomic <code>updateOne</code> with <code>arrayFilters</code> for changed parameters only, keeping sibling readings in the same frame untouched.
                    </li>
                    <li>
                      <strong>Math Syntax:</strong> The symbol <code>^</code> represents exponentiation/power (e.g., <code>x^2</code> is computed as <code>x ** 2</code>).
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Scope Selection */}
            <div>
              <label className="form-label small fw-bold text-muted text-uppercase mb-2">
                Recompute Scope
              </label>
              <div className="d-flex flex-wrap gap-2">
                {selectedFrameId && (
                  <button
                    type="button"
                    className={`btn btn-sm d-flex align-items-center gap-1 ${
                      scope === "frame" ? "btn-info text-dark fw-bold" : "btn-egse-outline"
                    }`}
                    onClick={() => setScope("frame")}
                    disabled={isRunning}
                  >
                    <Layers size={14} />
                    <span>Current Frame: {currentFrame?.name || "Selected Frame"}</span>
                  </button>
                )}
                {selectedSubsystemId && (
                  <button
                    type="button"
                    className={`btn btn-sm d-flex align-items-center gap-1 ${
                      scope === "subsystem" ? "btn-info text-dark fw-bold" : "btn-egse-outline"
                    }`}
                    onClick={() => setScope("subsystem")}
                    disabled={isRunning}
                  >
                    <Cpu size={14} />
                    <span>Current Subsystem</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-1 ${
                    scope === "project" ? "btn-info text-dark fw-bold" : "btn-egse-outline"
                  }`}
                  onClick={() => setScope("project")}
                  disabled={isRunning}
                >
                  <ShieldCheck size={14} />
                  <span>Entire Project ({projectName || "Active Project"})</span>
                </button>
              </div>

              {selectedSourceFile && (
                <div className="form-check mt-2 small">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="filterByFileCheckbox"
                    checked={filterByFile}
                    onChange={(e) => setFilterByFile(e.target.checked)}
                    disabled={isRunning}
                  />
                  <label className="form-check-label text-muted" htmlFor="filterByFileCheckbox">
                    Limit recompute strictly to active file:{" "}
                    <code className="text-light">{selectedSourceFile}</code>
                  </label>
                </div>
              )}
            </div>

            {/* Parameter selection, frame scope only */}
            {scope === "frame" && selectableParameters.length > 0 && (
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <label className="form-label small fw-bold text-muted text-uppercase mb-0">
                    Parameters to Recompute
                  </label>
                  <span className="small text-muted">
                    {selectedParameterIds.length === 0 ? "All stale parameters" : `${selectedParameterIds.length} selected`}
                  </span>
                </div>
                <div className="border rounded p-2" style={{ maxHeight: "140px", overflowY: "auto", borderColor: "var(--egse-border-soft, #2a3447)" }}>
                  {selectableParameters.map((p) => {
                    const id = p._id || p.id;
                    return (
                      <div className="form-check small" key={id}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`recompute-param-${id}`}
                          checked={selectedParameterIds.includes(id)}
                          onChange={() => toggleParameter(id)}
                          disabled={isRunning}
                        />
                        <label className="form-check-label text-light font-monospace" htmlFor={`recompute-param-${id}`}>
                          {p.name}
                          {staleParameters?.[id] && <span className="badge bg-warning text-dark ms-2">stale</span>}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unfinished jobs */}
            {resumableJobs.length > 0 && (
              <div>
                <label className="form-label small fw-bold text-muted text-uppercase mb-2">
                  Unfinished Jobs
                </label>
                <div className="d-flex flex-column gap-2">
                  {resumableJobs.map((job) => (
                    <div
                      key={job.id || job._id}
                      className="p-2 rounded border d-flex align-items-center justify-content-between gap-3"
                      style={{ borderColor: "var(--egse-border-soft, #2a3447)" }}
                    >
                      <div className="small">
                        <div className="text-light">
                          <span className="badge bg-secondary me-2">{job.status}</span>
                          {describeJobScope(job)}
                        </div>
                        <div className="text-muted font-monospace" style={{ fontSize: "0.72rem" }}>
                          {job.processedRecords ?? 0} / {job.totalRecords ?? 0} documents · {job.updatedReadings ?? 0} readings
                          {job.parameterCount > 0 ? ` · ${job.parameterCount} parameters` : ""}
                        </div>
                        {job.lastError && <div className="text-muted" style={{ fontSize: "0.72rem" }}>{job.lastError}</div>}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-warning d-inline-flex align-items-center gap-1 flex-shrink-0"
                        onClick={() => handleResume(job)}
                        disabled={isRunning}
                      >
                        <RotateCcw size={13} />
                        <span>Resume</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Configured Equations in Current Scope */}
            <div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <label className="form-label small fw-bold text-muted text-uppercase mb-0">
                  Configured Equations in Current Frame ({parametersWithEquations.length})
                </label>
                <span className="small text-muted font-monospace" style={{ fontSize: "0.72rem" }}>
                  Note: <code>^</code> means power
                </span>
              </div>

              {parametersWithEquations.length > 0 ? (
                <div
                  className="table-responsive border rounded"
                  style={{ maxHeight: "160px", overflowY: "auto", borderColor: "var(--egse-border-soft, #2a3447)" }}
                >
                  <table className="table table-sm egse-table table-hover align-middle mb-0 font-monospace" style={{ fontSize: "0.75rem" }}>
                    <thead className="bg-dark sticky-top">
                      <tr>
                        <th>Parameter</th>
                        <th>Equation</th>
                        <th>Equation Hash</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parametersWithEquations.map((p) => (
                        <tr key={p._id || p.id || p.name}>
                          <td className="fw-semibold text-light">{p.name}</td>
                          <td className="text-warning">
                            <code>{p.equation}</code>
                          </td>
                          <td className="text-muted small">
                            {p.equationHash ? (
                              <span className="badge bg-dark border border-secondary text-info">
                                <Hash size={10} className="me-1" />
                                {p.equationHash}
                              </span>
                            ) : (
                              <span className="text-secondary">—</span>
                            )}
                          </td>
                          <td className="text-muted">{p.unit || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3 text-center border rounded small text-muted">
                  No parameters in this frame currently have custom equations configured. Scale and offset changes are still recomputed.
                </div>
              )}
            </div>

            {/* In-Memory Progress Indicator */}
            {isRunning && (
              <div
                className="p-3 rounded border text-center"
                style={{
                  backgroundColor: "rgba(234, 179, 8, 0.08)",
                  borderColor: "rgba(234, 179, 8, 0.3)",
                }}
              >
                <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
                  <RefreshCw size={18} className="spin-anim text-warning" />
                  <span className="fw-bold text-warning small">
                    Recomputing Telemetry In Progress...
                  </span>
                </div>
                <div className="small text-muted font-monospace">
                  Job progress persisted in MongoDB · Updating documents via atomic arrayFilters...
                </div>
                {jobProgress && (
                  <div className="mt-2 small text-info font-monospace">
                    Processed: {jobProgress.processedRecords ?? jobProgress.processedDocs ?? 0} / {jobProgress.totalRecords ?? jobProgress.totalDocs ?? "calculating..."} documents
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="alert alert-danger py-2 small mb-0 d-flex align-items-center gap-2">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Execution Result */}
            {executionResult && (
              <div
                className="p-3 rounded border"
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.08)",
                  borderColor: "rgba(34, 197, 94, 0.3)",
                }}
              >
                <div className="d-flex align-items-center gap-2 mb-2 text-success">
                  <CheckCircle size={18} />
                  <span className="fw-bold small">
                    Recomputation Finished Successfully
                  </span>
                </div>
                <div className="row g-2 font-monospace small">
                  <div className="col-sm-4">
                    <div className="p-2 rounded bg-dark border border-secondary">
                      <div className="text-muted" style={{ fontSize: "0.7rem" }}>DOCUMENTS UPDATED</div>
                      <div className="fs-6 fw-bold text-light">
                        {executionResult.updatedRecords ?? executionResult.processedRecords ?? 0}
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-4">
                    <div className="p-2 rounded bg-dark border border-secondary">
                      <div className="text-muted" style={{ fontSize: "0.7rem" }}>READINGS RECOMPUTED</div>
                      <div className="fs-6 fw-bold text-info">
                        {executionResult.updatedReadings ?? 0}
                      </div>
                    </div>
                  </div>
                  <div className="col-sm-4">
                    <div className="p-2 rounded bg-dark border border-secondary">
                      <div className="text-muted" style={{ fontSize: "0.7rem" }}>EXECUTION DURATION</div>
                      <div className="fs-6 fw-bold text-warning">
                        {executionResult.durationMs ? `${Number(executionResult.durationMs).toFixed(1)} ms` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
                {executionResult.parametersUpdated?.length > 0 && (
                  <div className="small text-muted mt-2 font-monospace" style={{ fontSize: "0.72rem" }}>
                    Parameters updated: {executionResult.parametersUpdated.join(", ")}
                  </div>
                )}
                {(executionResult.updatedRecords ?? executionResult.processedRecords ?? 0) === 0 && (
                  <div className="small text-muted mt-2 font-monospace" style={{ fontSize: "0.72rem" }}>
                    {executionResult.message || "No stale readings were found in this scope."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="modal-footer d-flex align-items-center justify-content-between p-3"
            style={{ borderTop: "1px solid var(--egse-border-soft, #2a3447)" }}
          >
            <div className="small text-muted font-monospace">
              {jobId ? `Job ID: ${jobId}` : "Engine: AST Sandboxed Compiler"}
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
                disabled={isRunning}
              >
                {executionResult ? "Done" : "Cancel"}
              </button>

              <button
                type="button"
                className="btn btn-sm btn-warning text-dark fw-bold d-inline-flex align-items-center gap-1 shadow-sm"
                onClick={handleStartRecompute}
                disabled={isRunning}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={14} className="spin-anim" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    <span>{executionResult ? "Re-run Recompute (Idempotent)" : "Start Recompute"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

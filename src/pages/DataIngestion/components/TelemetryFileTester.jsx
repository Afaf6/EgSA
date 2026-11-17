import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectSelectedProject } from "../../../redux/slices/projectsSlice";
import telemetryService from "../../../services/telemetryService";
import { UploadCloud, AlertTriangle, RefreshCw, Layers, FileText, Clock, Info } from "lucide-react";
import DecodedResultsViewer from "./DecodedResultsViewer";
import BatchTelemetryUploader from "./BatchTelemetryUploader";
import { buildUploadResult } from "../../../utils/uploadResult";
import {
  getStoredIngestionTimeout,
  setStoredIngestionTimeout,
  validateTimeoutInput,
  formatTimeoutDuration,
} from "../../../utils/timeoutHelper";

export default function TelemetryFileTester({ onUploadComplete }) {
  const navigate = useNavigate();
  const selectedProject = useSelector(selectSelectedProject);
  const [uploadMode, setUploadMode] = useState("batch"); // 'batch' | 'single'
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [forceReupload, setForceReupload] = useState(false);
  const [serverStats, setServerStats] = useState(null);
  const [duplicateNotice, setDuplicateNotice] = useState(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const resultsRef = useRef(null);
  const fileInputRef = useRef(null);

  // Ingestion Timeout Configuration (session-persisted, default 90s)
  const [timeoutInput, setTimeoutInput] = useState(() => String(getStoredIngestionTimeout()));
  const [timeoutError, setTimeoutError] = useState("");
  const [activeTimeoutSeconds, setActiveTimeoutSeconds] = useState(() => getStoredIngestionTimeout());

  const handleTimeoutChange = (e) => {
    const val = e.target.value;
    setTimeoutInput(val);
    const validated = validateTimeoutInput(val);
    if (validated.valid) {
      setTimeoutError("");
      setActiveTimeoutSeconds(validated.value);
      setStoredIngestionTimeout(validated.value);
    } else {
      setTimeoutError(validated.error);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!selectedProject?.id) {
      setError("Please select an active mission project first.");
      return;
    }

    const timeoutValidation = validateTimeoutInput(timeoutInput);
    if (!timeoutValidation.valid) {
      setError(`Cannot start ingestion: ${timeoutValidation.error}`);
      return;
    }

    setError("");
    setDuplicateNotice(null);
    setServerStats(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const res = await telemetryService.uploadTelemetryFile(
        file,
        selectedProject.id,
        (percent) => setUploadProgress(percent),
        forceReupload,
        timeoutValidation.value
      );

      const stats = res?.data?.stats || res?.data || res;

      // Duplicate detected & skipped by backend
      if (stats?.skipped || res?.skipped) {
        const skippedReason = stats?.message || `File "${file.name}" was already processed and skipped.`;
        setDuplicateNotice(
          `${skippedReason} No duplicate records were added. Check "Force re-process if already uploaded" to replace existing telemetry.`
        );
        setServerStats(null);
        return;
      }

      setServerStats(buildUploadResult(stats, file));

      if (onUploadComplete) {
        onUploadComplete();
      }

      // Smooth scroll to decoded results view
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

    } catch (err) {
      const isDuplicate =
        err?.statusCode === 409 ||
        err?.raw?.response?.status === 409 ||
        err?.message?.toLowerCase().includes("already processed") ||
        err?.message?.toLowerCase().includes("already exists") ||
        err?.message?.toLowerCase().includes("skipped file");

      if (isDuplicate) {
        const skippedReason = err.message || `File "${file.name}" was already processed and skipped.`;
        setDuplicateNotice(
          `${skippedReason} No duplicate records were added. Check "Force re-process if already uploaded" to replace existing telemetry.`
        );
        setServerStats(null);
        setError("");
      } else {
        setError(err.message || "Failed to process and ingest telemetry file");
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (!selectedProject) {
    return (
      <section className="egse-panel mb-3 p-4 text-center">
        <div className="py-4 d-flex flex-column align-items-center justify-content-center">
          <div
            className="p-3 rounded-circle mb-3 d-flex align-items-center justify-content-center"
            style={{
              background: "rgba(6, 182, 212, 0.12)",
              color: "var(--egse-raw, #06b6d4)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
            }}
          >
            <AlertTriangle size={32} />
          </div>
          <h3 className="h5 fw-bold mb-2">No Mission Project Selected</h3>
          <p className="text-muted small mb-4" style={{ maxWidth: "480px" }}>
            Telemetry file ingestion and decoding requires an active satellite mission context. Please select or create a project on the Mission Dashboard to proceed.
          </p>
          <Link to="/dashboard" className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-2">
            Return to Mission Dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="egse-panel mb-3">
      <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <h2 className="egse-panel-title mb-0 d-flex align-items-center gap-2">
            <UploadCloud size={18} className="text-info" />
            Ingest & Decode Telemetry File
          </h2>
          <div className="small text-muted" style={{ fontSize: "0.78rem" }}>
            Upload raw telemetry logs (.txt / .log) for mission {selectedProject?.name || "selected project"}
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          <label className="form-check form-check-inline mb-0 small text-muted user-select-none" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              className="form-check-input"
              checked={forceReupload}
              onChange={(e) => setForceReupload(e.target.checked)}
              disabled={isUploading}
            />
            <span className="ms-1">Force re-process if already uploaded</span>
          </label>

          <label className={`btn btn-sm btn-egse-primary mb-0 d-flex align-items-center gap-1 ${(isUploading || timeoutError) ? "disabled opacity-50" : ""}`} style={{ cursor: (isUploading || timeoutError) ? "not-allowed" : "pointer" }}>
            <UploadCloud size={15} />
            {isUploading ? `Ingesting (${uploadProgress}%)` : "Select & Ingest Log"}
            <input
              type="file"
              accept=".txt,.log,text/plain"
              hidden
              disabled={isUploading || Boolean(timeoutError)}
              onChange={(e) => {
                handleFileUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="egse-panel-body">
        {/* Ingestion Mode Toggle & Ingestion Timeout Control */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 pb-2 border-bottom border-secondary border-opacity-25">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm d-inline-flex align-items-center gap-1 rounded ${
                uploadMode === "batch"
                  ? "btn-info"
                  : "btn-outline-secondary"
              }`}
              onClick={() => setUploadMode("batch")}
            >
              <Layers size={14} />
              <span>Batch Upload (Multiple Files)</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm d-inline-flex align-items-center gap-1 rounded ${
                uploadMode === "single"
                  ? "btn-info"
                  : "btn-outline-secondary"
              }`}
              onClick={() => setUploadMode("single")}
            >
              <FileText size={14} />
              <span>Single File Ingestion</span>
            </button>
          </div>

          {/* User-Configurable Ingestion Timeout */}
          <div className="d-flex flex-column align-items-end">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <label htmlFor="ingestion-timeout-input" className="small text-muted mb-0 d-inline-flex align-items-center gap-1 text-nowrap fw-semibold">
                <Clock size={13} className="text-info" />
                Ingestion Timeout (seconds):
              </label>
              <input
                id="ingestion-timeout-input"
                type="number"
                min="1"
                step="1"
                className={`form-control form-control-sm font-monospace text-center ${timeoutError ? "is-invalid border-danger" : ""}`}
                style={{
                  width: "105px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: "var(--egse-text-primary, #fff)",
                  fontSize: "0.82rem",
                }}
                value={timeoutInput}
                onChange={handleTimeoutChange}
                disabled={isUploading}
                placeholder="90"
              />
              {!timeoutError && (
                <span
                  className="badge bg-dark text-info border border-secondary font-monospace"
                  style={{ fontSize: "0.72rem", padding: "4px 7px" }}
                  title="Complete request timeout: upload + processing + persistence"
                >
                  Active: {formatTimeoutDuration(activeTimeoutSeconds)}
                </span>
              )}
            </div>
            {timeoutError && (
              <div className="text-danger small mt-1 fw-semibold" style={{ fontSize: "0.72rem" }}>
                {timeoutError}
              </div>
            )}
          </div>
        </div>

        {/* Duplicate Upload Notice (File skipped, no new data ingested) */}
        {duplicateNotice && (
          <div
            className="alert alert-info py-2 px-3 small d-flex align-items-center justify-content-between gap-2 mb-3"
            role="status"
            style={{
              backgroundColor: "rgba(6, 182, 212, 0.12)",
              border: "1px solid rgba(6, 182, 212, 0.35)",
              color: "#a5f3fc",
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <Info size={16} className="text-info flex-shrink-0" />
              <span>{duplicateNotice}</span>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white ms-2"
              aria-label="Dismiss duplicate notice"
              onClick={() => setDuplicateNotice(null)}
            />
          </div>
        )}

        {/* The top button uploads in both modes, so its feedback is shown in both. */}
        {error && (
          <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-3" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Upload Progress Bar & Spinner */}
        {isUploading && (
          <div className="mb-3 p-3 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-25">
            <div className="d-flex justify-content-between align-items-center small text-light mb-2">
              <span className="d-flex align-items-center gap-2">
                <RefreshCw size={14} className="spinner-border spinner-border-sm text-info" />
                <span>Streaming bytes, validating CRCs, and decoding telemetry parameters...</span>
              </span>
              <strong className="text-info">{uploadProgress}%</strong>
            </div>
            <div className="progress" style={{ height: "8px", backgroundColor: "var(--egse-bg-raised)" }}>
              <div
                className="progress-bar progress-bar-striped progress-bar-animated bg-info"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Rich Decoded Results View immediately upon upload success */}
        {serverStats && (
          <div ref={resultsRef}>
            <DecodedResultsViewer
              stats={serverStats}
              onReset={() => setServerStats(null)}
              onNavigateLive={() => navigate(`/project/${encodeURIComponent(selectedProject.id)}/monitoring`)}
            />
          </div>
        )}

        {uploadMode === "batch" ? (
          <BatchTelemetryUploader
            onUploadComplete={onUploadComplete}
            timeoutSeconds={activeTimeoutSeconds}
            timeoutError={timeoutError}
          />
        ) : !serverStats && !isUploading && (
          <div
            className={`rounded-3 p-5 text-center transition-all ${
              isDragging
                ? "border border-info bg-info bg-opacity-10"
                : "border border-secondary border-opacity-25 bg-dark bg-opacity-25"
            }`}
            style={{ borderStyle: "dashed", cursor: "pointer" }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.log,text/plain"
              hidden
              onChange={(e) => {
                handleFileUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <UploadCloud size={36} className={`mb-2 ${isDragging ? "text-info" : "text-muted"}`} />
            <h3 className="egse-heading h6 mb-1 text-light">
              Drag & Drop Telemetry Log (.txt / .log)
            </h3>
            <p className="small text-muted mb-3" style={{ fontSize: "0.82rem" }}>
              or click here to select a transmission file to parse and decode in real time
            </p>
            <button type="button" className="btn btn-sm btn-egse-primary">
              Select Log File
            </button>
          </div>
        )}
      </div>
    </section>
  );
}